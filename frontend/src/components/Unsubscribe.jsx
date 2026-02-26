import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

export default function Unsubscribe() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const success = searchParams.get('success') === 'true';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'var(--bg)',
      color: 'var(--text)',
      padding: '20px',
      textAlign: 'center',
    }}>
      {success ? (
        <>
          <h2 style={{ color: 'var(--gold)', marginBottom: '12px' }}>Unsubscribed</h2>
          <p style={{ color: 'var(--text2)', fontSize: '0.9em', maxWidth: '400px' }}>
            You've been removed from the Sankyaan newsletter. You won't receive any more emails from us.
          </p>
        </>
      ) : (
        <>
          <h2 style={{ color: 'var(--text)', marginBottom: '12px' }}>Unsubscribe</h2>
          <p style={{ color: 'var(--text2)', fontSize: '0.9em' }}>
            Invalid or expired unsubscribe link.
          </p>
        </>
      )}
      <button
        onClick={() => navigate('/')}
        style={{
          marginTop: '24px',
          padding: '10px 24px',
          background: 'var(--bg3)',
          border: '1px solid var(--bg4)',
          borderRadius: '8px',
          color: 'var(--text)',
          fontSize: '0.85em',
          cursor: 'pointer',
        }}
      >
        Back to Sankyaan
      </button>
    </div>
  );
}
