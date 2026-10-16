import { useState, useEffect, useRef } from 'react';
import Link from '../components/Link';

export default function Work({ cta = true }) {
  return (
    <section className="work sec">
      <span className="tag">Panik for work</span>
      <h2>Your team can’t Slack their way out of burnout.</h2>
      <p>
        Panik404 builds mental-health and wellness support for workplaces — sessions your people will actually
        book, and workshops they won’t dread.
      </p>
      <div className="chips" style={{ margin: '14px 0 20px' }}>
        {[
          'Employee mental-health support',
          'Workshops',
          'Wellness programs',
          'Online and onsite formats',
          'Custom programs',
        ].map((t) => (
          <span className="chip" key={t}>
            {t}
          </span>
        ))}
      </div>
      {cta && (
        <Link className="btn wh" to="/corporate">
          Build a Wellness Program
        </Link>
      )}
    </section>
  );
}
