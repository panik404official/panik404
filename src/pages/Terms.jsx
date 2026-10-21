import Link from '../components/Link';
import { CONTACT_EMAIL, SITE, TERMS, TERMS_CLOSING, TERMS_INTRO } from '../data/terms';

function Block({ b }) {
  if (typeof b === 'string') return <p>{b}</p>;
  if (b.ul)
    return (
      <ul>
        {b.ul.map((li) => (
          <li key={li}>{li}</li>
        ))}
      </ul>
    );
  if (b.h) return <h3>{b.h}</h3>;
  if (b.callout) return <p className="terms-callout">{b.callout}</p>;
  if (b.email)
    return (
      <p>
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    );
  if (b.contact)
    return (
      <dl className="terms-contact">
        <dt>Panik</dt>
        <dd>
          Website: <a href={`https://${SITE}`}>{SITE}</a>
        </dd>
        <dd>
          Email: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </dd>
        <dd>
          Or send us a message on the <Link to="/contact">contact page</Link>.
        </dd>
      </dl>
    );
  return null;
}

export default function Terms() {
  return (
    <div className="terms">
      <span className="tag">Legal</span>
      <h1>Terms &amp; Conditions</h1>
      <div className="terms-intro">
        {TERMS_INTRO.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      <div className="terms-layout">
        <nav className="terms-toc" aria-label="Sections">
          <b>On this page</b>
          <ol>
            {TERMS.map((s) => (
              <li key={s.id}>
                {/* HashRouter owns the URL hash, so scroll in place instead of following #anchors */}
                <a
                  href={`#terms-${s.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(`terms-${s.id}`)?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <article className="terms-body">
          {TERMS.map((s, i) => (
            <section key={s.id} id={`terms-${s.id}`}>
              <h2>
                <span className="terms-n">{i + 1}.</span> {s.title}
              </h2>
              {s.blocks.map((b, j) => (
                <Block key={j} b={b} />
              ))}
            </section>
          ))}
          <p className="terms-closing">{TERMS_CLOSING}</p>
        </article>
      </div>
    </div>
  );
}
