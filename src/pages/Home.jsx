import { useState, useEffect, useRef } from 'react';
import Link from '../components/Link';
import Story from '../features/story/Story';
import { HFAQ } from '../data/faqs';

export default function Home() {
  return (
    <>
      <Story />
      <section className="sec">
        <h2>Before you overthink it.</h2>
        {HFAQ.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </section>
    </>
  );
}
