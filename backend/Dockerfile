FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /srv
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY app app
RUN useradd -m api && chown -R api /srv
USER api
EXPOSE 8001
# Run migrations as a release step:  tortoise -c app.tortoise_conf.TORTOISE_ORM migrate
# Each worker has its own DB pool and ingest buffer; keep workers * DB_POOL_MAX within your Neon limits.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2", "--proxy-headers"]
