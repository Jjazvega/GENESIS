# GEMAILLA Core

Versión limpia enfocada en:

- Dashboard
- Empresas
- Documentos
- Finanzas
- IA

## Comandos

```bash
npm install
npm run test:unit
npm run build
npm run dev
```

## Seguridad

- IA solo por `/api/ai`.
- No se guardan URLs públicas de documentos.
- Los documentos usan `storagePath`.
- PDF/XML máximo 15 MB.
- Borrado lógico con `status: archived`.

## Seguridad y arquitectura

- [Arquitectura por capas obligatoria](docs/architecture/layers.md): define responsabilidades de `pages/`, `modules/`, `features/`, `api/`, `infrastructure/` y `lib/`, junto con reglas de importación.
