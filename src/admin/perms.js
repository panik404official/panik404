// Mirrors backend/app/auth.py PERMISSIONS. Admins have all of them; psychologists only what an admin grants.
export const PERMISSIONS = [
  ['consent_assigned', 'Consent forms assigned to them (view and sign)'],
  ['consent_manage', 'All consent forms (create links, assign psychologists, close links)'],
  ['overview', 'Overview and analytics'],
  ['orders', 'Orders'],
  ['customers', 'Customers'],
  ['visitors', 'Visitors and live activity'],
  ['partners', 'Partner bookings (Ibex)'],
  ['leads', 'Contact messages and corporate leads'],
  ['catalogue', 'Products and payments'],
];
export const DEFAULT_PSYCHOLOGIST = ['consent_assigned'];
export const ROLE_LABEL = { admin: 'Admin', psychologist: 'Psychologist' };
