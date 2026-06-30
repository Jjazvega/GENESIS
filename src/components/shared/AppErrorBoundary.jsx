import { Component } from 'react';
import { captureFrontendError, createCorrelationId } from '@/lib/observability';

export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, correlationId: '' };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    const correlationId = createCorrelationId('react');
    this.setState({ correlationId });
    captureFrontendError(error, {
      correlationId,
      context: { componentStack: errorInfo.componentStack },
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
          <div className="max-w-lg rounded-xl border bg-card p-6 shadow-sm">
            <h1 className="text-xl font-semibold">Algo salió mal</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ya registramos el incidente para el equipo de soporte. Comparte este ID si necesitas ayuda.
            </p>
            <code className="mt-4 block rounded bg-muted px-3 py-2 text-xs break-all">
              {this.state.correlationId || 'pendiente'}
            </code>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
