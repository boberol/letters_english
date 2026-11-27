import React from 'react';
import { RotateCcw } from 'lucide-react';

// A crash inside one activity used to leave a blank page - on a child's
// tablet, with nobody there who knows to reload it. This catches it, shows a
// big picture and one button, and hands the child back to the home screen.
// Keyed by the view in App.jsx, so opening another activity starts clean.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error('Activity crashed:', error, info?.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="error-fallback" role="alert">
        <div className="error-fallback-picture" aria-hidden="true">
          🙈
        </div>
        <p className="error-fallback-text">Ups, coś poszło nie tak.</p>
        <button
          className="action-btn btn-next error-fallback-btn"
          onClick={() => {
            this.setState({ failed: false });
            this.props.onReset?.();
          }}
          aria-label="Wróć do zabaw"
        >
          <RotateCcw size={22} aria-hidden="true" />
        </button>
      </div>
    );
  }
}
