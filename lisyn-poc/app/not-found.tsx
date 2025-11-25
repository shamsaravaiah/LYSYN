export default function NotFound() {
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      textAlign: 'center',
      padding: '2rem'
    }}>
      <h1 style={{ fontSize: '3rem', marginBottom: '1rem', fontWeight: 'bold' }}>404</h1>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Page Not Found</h2>
      <p style={{ marginBottom: '2rem', color: '#666' }}>
        The page you are looking for does not exist.
      </p>
      <a 
        href="/" 
        style={{ 
          padding: '0.75rem 1.5rem', 
          backgroundColor: '#0070f3', 
          color: 'white', 
          textDecoration: 'none',
          borderRadius: '0.5rem',
          display: 'inline-block'
        }}
      >
        Go Home
      </a>
    </div>
  );
}