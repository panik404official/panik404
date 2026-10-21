// Text of the informed consent form. The page and the signed PDF both read from here, so they always match.
// Blocks: string = paragraph, { ul: [...] } = bullet list.
export const INTRO =
  'This form explains the nature of psychological services, the rights and responsibilities of the client, and the terms under which services are provided. Please read it carefully and ask your psychologist any questions before signing.';

export const STEPS = [
  'Fill in your details',
  'Read each section',
  'Sign with your finger or mouse',
  'Sign and finish to send it to Panik',
];

export const TERMS = [
  {
    title: 'Nature of psychological services',
    blocks: [
      'I understand that psychological services may include psychological assessment, counselling, psychotherapy, psychoeducation, emotional support, and other interventions appropriate to my needs.',
      'My psychologist will discuss the recommended approach, goals, and expected duration of services with me. I understand that the type of support provided will depend on my individual circumstances and the professional assessment of my psychologist.',
      'I understand that psychological services do not guarantee a particular outcome and that progress may vary from person to person.',
    ],
  },
  {
    title: 'Potential benefits and risks',
    blocks: [
      'I understand that psychological services may help me improve emotional well-being, develop coping strategies, understand my thoughts and behaviours, and manage personal or professional challenges.',
      'I also understand that discussing difficult experiences or emotions may sometimes cause temporary discomfort, distress, or anxiety. I may raise concerns with my psychologist at any time.',
    ],
  },
  {
    title: 'Confidentiality and privacy',
    blocks: [
      'Information shared during psychological sessions will be treated as confidential and handled in accordance with applicable professional and legal requirements.',
      'Confidentiality may be limited in circumstances such as:',
      {
        ul: [
          'Where disclosure is required by applicable law or a valid legal order.',
          'Where there is a serious and imminent risk of harm to the client or another person, subject to applicable law and professional obligations.',
          'Where there are safeguarding concerns involving a child or vulnerable person that require reporting under applicable law.',
          'Where the client provides valid consent for specific information to be disclosed.',
        ],
      },
      'Where reasonably possible and legally permitted, the psychologist will discuss necessary disclosures with the client.',
    ],
  },
  {
    title: 'Records and data protection',
    blocks: [
      'I understand that my psychologist may maintain appropriate clinical notes, assessment records, and other documentation necessary for providing professional services.',
      'My information will be stored and handled using reasonable safeguards and in accordance with applicable privacy requirements and professional standards.',
      'I understand that relevant information may be shared with other professionals only when authorized by me or otherwise permitted or required by law.',
    ],
  },
  {
    title: 'Corporate wellness and employer privacy',
    blocks: [
      'Where psychological services are provided through an employer or corporate wellness program, I understand that my participation and personal disclosures will remain confidential, subject to the limits described in this form.',
      'My employer or organization will not routinely receive the contents of my individual sessions, clinical notes, diagnosis, or personal disclosures.',
      'Any information shared with the employer, such as attendance or aggregated program feedback, will be limited to what has been explained to me and appropriately authorized or otherwise lawfully permitted. Individual information will not be shared merely because the employer is funding the service.',
      'If any specific information is to be shared with my employer, the purpose, recipient, and scope of disclosure will be explained to me, and my separate authorization will be obtained where required.',
    ],
  },
  {
    title: 'Voluntary participation and right to withdraw',
    blocks: [
      'I understand that participation in psychological services is voluntary, except where a specific legal requirement applies.',
      'I may ask questions, discuss concerns, decline a particular intervention, or discontinue services at any time. I understand that discontinuing services may affect continuity of care, and my psychologist may discuss appropriate follow-up or referral options with me.',
    ],
  },
  {
    title: 'Professional boundaries and referrals',
    blocks: [
      'I understand that my psychologist will work within their professional competence and ethical obligations.',
      'If my needs fall outside the scope of the services provided, my psychologist may recommend a referral to another qualified professional or an appropriate healthcare service.',
      'I understand that psychological services do not replace emergency medical care when urgent intervention is necessary.',
    ],
  },
  {
    title: 'Online sessions (if applicable)',
    blocks: [
      'If services are provided online, I understand that electronic communication and remote sessions may carry privacy and technical risks.',
      'I agree to take reasonable steps to participate from a private location and use an appropriate device and internet connection. The psychologist will explain relevant procedures for technical interruptions and emergencies.',
    ],
  },
  {
    title: 'Fees and cancellation policy',
    blocks: [
      {
        ul: [
          'Session duration: 50 minutes',
          "Cancellation policy: Clients must provide at least 12 hours' advance notice to cancel or reschedule a session to be eligible for a refund or rescheduling without additional charges. Cancellations or rescheduling requests made less than 12 hours before the scheduled session may not be eligible for a refund.",
        ],
      },
      'Any applicable fees, payment arrangements, cancellation terms, and additional service conditions will be explained before services begin.',
    ],
  },
];

export const ACK = {
  title: 'Client acknowledgment',
  blocks: [
    'By signing below, I confirm that:',
    {
      ul: [
        'I have read and understood this form.',
        'I have had the opportunity to ask questions and receive explanations.',
        'I understand the nature, potential benefits, and potential risks of psychological services.',
        'I understand the limits of confidentiality and the handling of my personal information.',
        'I understand my rights regarding participation and withdrawal.',
        'I voluntarily consent to receive the psychological services discussed with my psychologist.',
      ],
    },
    'I understand that I may request clarification about any part of this form at any time.',
  ],
};

export const ACK_CHECK =
  'I have read this form and I voluntarily consent to receive the psychological services described in it.';

export const CONFIRM = {
  title: 'Psychologist’s confirmation',
  blocks: [
    "I confirm that I have explained the nature of the psychological services, the relevant limits of confidentiality, and the client's rights. I have provided an opportunity for questions and have addressed the client's concerns to the best of my professional ability.",
  ],
};

export const PANIK_EMAIL = 'Panik404offcial@gmail.com';
export const SITE = 'www.cornflowerblue-seahorse-446896.hostingersite.com';
export const DEFAULT_PSYCH = { pname: 'Mashal Zia', pqual: 'Clinical Psychologist' };

/** Required fields, in page order. Mirrors missing_fields() in backend/app/repos/consent.py. */
export function checks(f) {
  const txt = (k) => String(f[k] ?? '').trim();
  const digits = (k) => txt(k).replace(/\D/g, '').length;
  const list = [
    { k: 'name', ok: !!txt('name'), msg: 'Enter your full name.' },
    { k: 'dob', ok: !!txt('dob'), msg: 'Enter your date of birth.' },
    { k: 'phone', ok: digits('phone') >= 7, msg: 'Enter a phone number.' },
    { k: 'email', ok: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(txt('email')), msg: 'Enter a valid email so you receive a copy.' },
    { k: 'ename', ok: !!txt('ename'), msg: 'Enter an emergency contact name.' },
    { k: 'ephone', ok: digits('ephone') >= 7, msg: 'Enter an emergency contact number.' },
    { k: 'session_time', ok: !!txt('session_time'), msg: 'Enter the session date and time.' },
    { k: 'ack', ok: f.ack === true, msg: 'Tick the box to confirm you consent.' },
    { k: 'sig_client', ok: !!f.sig_client, msg: 'Draw your signature.' },
    { k: 'pname', ok: !!txt('pname'), msg: "Enter the psychologist's name." },
    { k: 'sig_psych', ok: !!f.sig_psych, msg: 'The psychologist needs to sign.' },
  ];
  if (f.gneed) {
    list.push(
      { k: 'gname', ok: !!txt('gname'), msg: "Enter the guardian's name." },
      { k: 'grel', ok: !!txt('grel'), msg: 'Enter the relationship to the client.' },
      { k: 'sig_guardian', ok: !!f.sig_guardian, msg: 'The parent or guardian needs to sign.' },
    );
  }
  return list;
}
