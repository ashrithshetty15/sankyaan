import { useNavigate } from 'react-router-dom';
import './PrivacyPolicy.css';

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="privacy-page">
      <div className="privacy-container">
        <button className="privacy-back" onClick={() => navigate(-1)}>
          &larr; Back
        </button>

        <h1>Privacy Policy</h1>
        <p className="privacy-updated">Last updated: February 2026</p>

        <section>
          <h2>Overview</h2>
          <p>
            Sankyaan ("we", "us") is a portfolio analytics tool. We respect your
            privacy and are committed to protecting your personal data.
          </p>
        </section>

        <section>
          <h2>What We Collect</h2>
          <p>When you sign in with Google, we collect only:</p>
          <ul>
            <li><strong>Name</strong> — to personalise your experience</li>
            <li><strong>Email address</strong> — to identify your account</li>
            <li><strong>Profile picture</strong> — to display in the sidebar</li>
          </ul>
          <p>We do not access your contacts, Google Drive, or any other Google services.</p>
        </section>

        <section>
          <h2>How We Use Your Data</h2>
          <ul>
            <li>Authenticate you and maintain your session</li>
            <li>Grant access to premium features (Stock Scores, Fund Screener, etc.)</li>
          </ul>
          <p>That's it. We do not use your data for advertising, analytics profiling, or any other purpose.</p>
        </section>

        <section>
          <h2>Data Sharing</h2>
          <p>
            We <strong>do not sell, trade, or share</strong> your personal
            information with any third parties. Your data stays with us.
          </p>
        </section>

        <section>
          <h2>Data Storage &amp; Security</h2>
          <p>
            Your data is stored securely in our database. Sessions are managed
            via encrypted, httpOnly cookies. We do not store your Google
            password or access token.
          </p>
        </section>

        <section>
          <h2>Data Deletion</h2>
          <p>
            You can request deletion of your account and all associated data at
            any time by emailing{' '}
            <a href="mailto:contact@sankyaan.com">contact@sankyaan.com</a>.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            Questions about this policy? Reach us at{' '}
            <a href="mailto:contact@sankyaan.com">contact@sankyaan.com</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
