import { Component } from 'react';

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
