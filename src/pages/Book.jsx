import BookingForm from '../components/BookingForm';

export default function Book() {
  return (
    <>
      <span className="tag">Booking</span>
      <h1>Let’s find you the right support.</h1>
      <p>
        Please complete this form for initial screening and appointment coordination. This is not a diagnosis
        or emergency service.
      </p>
      <div className="row">
        {[
          'Private and confidential',
          'No therapist-shopping required',
          'We’ll explain what happens next',
        ].map((t) => (
          <span className="chip on" key={t}>
            ✓ {t}
          </span>
        ))}
      </div>
      <BookingForm />
      <div className="safety">
        <b>Urgent safety notice:</b> If you are in immediate danger, have active suicidal intent, recently
        seriously harmed yourself, are having a seizure, or have another medical emergency, contact local
        emergency services or go to the nearest emergency department now. Do not wait for this form.
      </div>
    </>
  );
}
