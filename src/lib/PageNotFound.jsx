import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Brain, ArrowLeft } from 'lucide-react';

export default function PageNotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
          <Brain className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-6xl font-display font-bold text-foreground mb-2">404</h1>
        <p className="text-muted-foreground mb-8">Página no encontrada</p>
        <Link to="/">
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
            <ArrowLeft className="w-4 h-4 mr-2" /> Volver al Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}