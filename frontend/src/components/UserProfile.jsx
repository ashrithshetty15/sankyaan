import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GoogleLoginButton from './GoogleLoginButton';
import './UserProfile.css';

export default function UserProfile() {
  const { user, loading, error, logout, clearError } = useAuth();

  if (loading) return null;

  if (!user) {
    return (
      <div className="user-profile-section">
        <div className="user-profile guest">
          <div className="guest-avatar">G</div>
          <div className="user-info">
            <span className="user-name">Guest</span>
            <span className="user-email">Sign in for full access</span>
          </div>
        </div>
        {error && (
          <div className="auth-error" onClick={clearError}>
            {error}
          </div>
        )}
        <div className="user-profile-login">
          <GoogleLoginButton />
        </div>
        <p className="privacy-note">
          We only use your name and email for login. No data is shared.<br />
          <Link to="/privacy">Privacy Policy</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="user-profile-section">
      <div className="user-profile">
        <img
          src={user.picture}
          alt={user.name}
          className="user-avatar"
          referrerPolicy="no-referrer"
        />
        <div className="user-info">
          <span className="user-name">{user.name}</span>
          <span className="user-email">{user.email}</span>
        </div>
      </div>
      <div className="user-profile-login">
        <button className="logout-btn-full" onClick={logout}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
