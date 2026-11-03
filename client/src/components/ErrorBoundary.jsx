import { Component } from 'react';

// `compact` is used around each page: a crash is contained to that page's
// area, so the menu and every other page keep working. Without it the whole
// screen is replaced (the last-resort boundary at the top of the app).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.compact) {
        return (
          <div className="flat-dashboard">
            <div className="flat-card flat-empty" role="alert">
              <strong>This page ran into a problem.</strong>
              <div style={{ margin: '6px 0 12px' }}>Your data is safe. The rest of MEDIHUB is still working.</div>
              <button type="button" className="flat-action-btn" onClick={() => this.setState({ hasError: false, error: null })}>Try again</button>
            </div>
          </div>
        );
      }
      return (
        <div className="error-fallback">
          <div className="error-content">
            <h1>Something went wrong</h1>
            <p>We encountered an unexpected error. Please refresh the page or try again.</p>
            <button onClick={() => window.location.reload()}>Refresh Page</button>
            <button onClick={() => this.setState({ hasError: false, error: null })}>Try Again</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
