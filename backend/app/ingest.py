"""Write-behind buffer for analytics events.

Requests only enqueue (microseconds, no DB round-trip). One background task drains the queue and
writes each batch in a single transaction: upsert visitors, upsert sessions, bulk insert events.
"""
import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

from tortoise.transactions import in_transaction

from .models import Event
from .repos.tracking import Ctx, session_obj, upsert_visitors_sessions, visitor_obj

log = logging.getLogger("ingest")
_STOP = object()

EventRow = tuple[datetime, str, str | None, dict[str, Any]]  # (ts, type, path, props)


@dataclass(slots=True)
class Item:
    visitor_id: UUID
    session_id: UUID
    ctx: Ctx
    received: datetime
    events: list[EventRow]


class IngestBuffer:
    def __init__(self, maxsize: int, max_batch: int, interval: float):
        self.max_batch, self.interval = max_batch, interval
        self._q: asyncio.Queue = asyncio.Queue(maxsize=maxsize)
        self._task: asyncio.Task | None = None
        self.dropped = 0

    def offer(self, item: Item) -> bool:
        try:
            self._q.put_nowait(item)
            return True
        except asyncio.QueueFull:
            self.dropped += 1
            return False

    async def start(self) -> None:
        self._task = asyncio.create_task(self._run(), name="ingest-writer")

    async def stop(self) -> None:
        if self._task:
            await self._q.put(_STOP)
            await asyncio.wait_for(self._task, timeout=20)

    async def _run(self) -> None:
        loop = asyncio.get_running_loop()
        stopping = False
        while not stopping:
            first = await self._q.get()
            if first is _STOP:
                break
            batch = [first]
            deadline = loop.time() + self.interval
            while len(batch) < self.max_batch:
                remaining = deadline - loop.time()
                if remaining <= 0:
                    break
                try:
                    nxt = await asyncio.wait_for(self._q.get(), remaining)
                except asyncio.TimeoutError:
                    break
                if nxt is _STOP:
                    stopping = True
                    break
                batch.append(nxt)
            await self._flush_with_retry(batch)
        rest = []
        while not self._q.empty():
            it = self._q.get_nowait()
            if it is not _STOP:
                rest.append(it)
        for i in range(0, len(rest), self.max_batch):
            await self._flush_with_retry(rest[i : i + self.max_batch])

    async def _flush_with_retry(self, items: list[Item]) -> None:
        for attempt in range(3):
            try:
                await self._flush(items)
                return
            except Exception:  # noqa: BLE001
                log.exception("ingest flush failed (attempt %d/3)", attempt + 1)
                await asyncio.sleep(0.5 * 2**attempt)
        self.dropped += sum(len(i.events) for i in items)
        log.error("dropping %d items after repeated failures", len(items))

    async def _flush(self, items: list[Item]) -> None:
        visitors: dict[UUID, Any] = {}
        sessions: dict[UUID, Any] = {}
        events: list[Event] = []
        for it in items:
            # last_seen_at uses server receive time, so it can never move backwards on late client clocks
            v = visitors.get(it.visitor_id)
            if v is None:
                visitors[it.visitor_id] = visitor_obj(it.visitor_id, it.received, it.ctx)
            else:
                v.last_seen_at = max(v.last_seen_at, it.received)
            s = sessions.get(it.session_id)
            if s is None:
                sessions[it.session_id] = session_obj(it.session_id, it.visitor_id, it.received, it.ctx)
            else:
                s.last_seen_at = max(s.last_seen_at, it.received)
            for ts, typ, path, props in it.events:
                events.append(Event(occurred_at=ts, visitor_id=it.visitor_id, session_id=it.session_id,
                                    type=typ, path=path, props=props))
        async with in_transaction():
            await upsert_visitors_sessions(list(visitors.values()), list(sessions.values()))
            await Event.bulk_create(events, batch_size=1000)
