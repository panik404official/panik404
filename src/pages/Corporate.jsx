import { useState, useEffect, useRef } from 'react';
import Link from '../components/Link';
import Work from '../components/Work';

export default function Corporate() {
  const [ok, setOk] = useState(false);
  return (
    <>
      <Work cta={false} />
      <div className="card" style={{ marginTop: 24 }}>
        <h2>Get a quote</h2>
        {ok ? (
          <p>Thanks! We’ll be in touch.</p>
        ) : (
          <>
            <label>Name</label>
            <input />
            <label>Work email</label>
            <input type="email" />
            <label>Team size</label>
            <input type="number" />
            <label>What would help your team?</label>
            <textarea rows="3" />
            <div style={{ marginTop: 16 }}>
              <button className="btn" onClick={() => setOk(true)}>
                Request a quote
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
