# DaviPlata USA

Repositorio independiente del simulador DaviPlata. No contiene código, datos ni recursos de Nequi o Bancolombia. Todas las operaciones representadas son simuladas; no se envía dinero real.

## Desarrollo

```sh
pnpm install
pnpm --filter @workspace/daviplata-usa run dev
```

## Compilación

```sh
pnpm install
pnpm run build
```

## API incluida

- `POST /api/daviplata/breb/lookup`: consulta externa de llave para completar nombre y entidad; no realiza pagos.
- `GET|POST|DELETE /api/daviplata/admin/session`: sesión del panel de administración.

Para habilitar la sesión del administrador en el entorno de publicación, configura `DAVIPLATA_ADMIN_PIN` y `SESSION_SECRET` como variables secretas del proveedor. No incluyas sus valores en el repositorio.

Las capturas de referencia y los archivos locales de entorno no se publican.
