import React from 'react';

export default function PageHeader({ title, description, actions }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
      <div>
        <h1 className="text-2xl font-display font-bold gold-title">{title}</h1>
        {description && <p className="text-xs text-muted-foreground mt-1 tracking-wide">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}