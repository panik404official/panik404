import { Link as RouterLink } from 'react-router-dom';

// Thin wrapper so every page links the same way
export default function Link({ to, children, ...props }) {
  return (
    <RouterLink to={to} {...props}>
      {children}
    </RouterLink>
  );
}
