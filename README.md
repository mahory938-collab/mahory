# Mahory POS

Sistema de punto de venta e inventario para la tienda **Mahory** — *Viste con amor, brilla con estilo.*

Hecho con TanStack Start, React 19, Tailwind CSS 4 y Supabase.

## Qué incluye

Punto de venta (efectivo, tarjeta, transferencia y crédito), productos con varios códigos de barras por nombre, inventario con historial de movimientos, caja, compras, proveedores, clientes, promociones, reportes y usuarios con roles (super administrador, administrador y vendedor).

## Cómo correrlo

```bash
npm install
cp .env.example .env   # y completar con las llaves de su proyecto de Supabase
npm run dev
```

## Base de datos

En un proyecto nuevo de Supabase, abrir el **SQL Editor** y ejecutar una sola vez
`supabase/schema/mahory_schema_completo.sql`. Crea las tablas, funciones, seguridad por filas,
la carpeta de fotos y la tienda inicial. El primer usuario que se registre queda como super administrador.

> El archivo `.env` contiene llaves privadas y **nunca** debe subirse al repositorio.
