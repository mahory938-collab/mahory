# Mahory POS

I want to build a professional desktop Point of Sale (POS) application for Windows for a retail store that sells clothing, shoes, accessories, home products, stationery, toys, cosmetics, groceries, and general merchandise.

The application must feel like a premium commercial product, similar to or better than Square POS, Loyverse, Lightspeed, and Tiendas ON.

The UI language must be 100% Spanish.

The code, architecture, comments, and project structure can be in English.

## Tech Stack

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase (Authentication, PostgreSQL, Storage, Realtime)
- Electron (Desktop Application)
- React Hook Form
- Zod
- TanStack Query
- Lucide Icons

The project must be modular, scalable, reusable, maintainable, and production-ready.

Use a clean architecture and reusable components.

Everything must be responsive and optimized for a 15-16 inch touch screen.

The application must open directly as a desktop application, not inside a browser.

The interface must be modern, elegant, fast and extremely intuitive.

Primary color:
Emerald Green

Secondary colors:
White
Light Gray
Dark Gray

Rounded corners
Soft shadows
Beautiful cards
Smooth animations
Minimalistic design

The application should look like premium commercial software.

----------------------------------------------------
AUTHENTICATION
----------------------------------------------------

Use Supabase Authentication.

Roles:

- Super Administrador
- Administrador
- Vendedor

Each role must have independent permissions.

----------------------------------------------------
MAIN MENU
----------------------------------------------------

Dashboard

Ventas

Productos

Inventario

Compras

Clientes

Proveedores

Caja

Reportes

Configuración

Usuarios

----------------------------------------------------
DASHBOARD
----------------------------------------------------

Show cards with:

Ventas del día

Ventas del mes

Ingresos

Ganancias

Productos con bajo inventario

Productos más vendidos

Últimas ventas

Resumen de caja

Quick actions

Beautiful charts.

----------------------------------------------------
POS SCREEN
----------------------------------------------------

This is the most important module.

It must be optimized for speed.

Very large buttons.

Touch friendly.

The cashier should complete a sale in just a few clicks.

Features:

Buscar producto por nombre

Buscar por código

Escanear código de barras

Cliente rápido

Clientes registrados

Crear cliente desde la venta

Cambiar cantidad

Editar precio (solo administradores)

Descuentos

Impuestos

Eliminar producto

Cancelar venta

Venta temporal

Pago en efectivo

Pago por transferencia

Pago con tarjeta

Pago mixto

Pago a crédito

Domicilios

Imprimir recibo

Reimprimir recibo

Historial de ventas

----------------------------------------------------
PRODUCT MANAGEMENT
----------------------------------------------------

This module must be extremely easy to use.

Allow adding products:

Option 1

One by one using an intuitive form.

Fields:

Nombre

Código de barras

SKU

Categoría

Marca

Descripción

Costo

Precio venta

Precio mayorista

Stock

Stock mínimo

Proveedor

Imagen

Estado

Option 2

Bulk import using Excel (.xlsx)

The Excel import should include:

Download template

Validate required columns

Preview before import

Show errors

Skip invalid rows

Import hundreds of products quickly

Generate import report

Option 3

CSV Import

Option 4

Barcode scanner to automatically fill barcode field.

----------------------------------------------------
PRODUCT CATEGORIES
----------------------------------------------------

CRUD

Nested categories

----------------------------------------------------
INVENTORY
----------------------------------------------------

Current stock

Stock history

Inventory adjustments

Inventory movements

Transfers

Inventory Kardex

Low stock alerts

Out of stock alerts

----------------------------------------------------
CUSTOMERS
----------------------------------------------------

CRUD

Purchase history

Credits

Addresses

Phone

Email

Customer notes

----------------------------------------------------
SUPPLIERS
----------------------------------------------------

CRUD

Purchase history

Contact information

----------------------------------------------------
PURCHASES
----------------------------------------------------

Create purchase

Receive inventory

Update stock automatically

Purchase history

----------------------------------------------------
CASH REGISTER
----------------------------------------------------

Open cash

Close cash

Cash movements

Income

Expenses

Cash count

Daily summary

----------------------------------------------------
REPORTS
----------------------------------------------------

Sales

Purchases

Inventory

Customers

Suppliers

Cash

Profit

Best selling products

Top customers

Export:

Excel

PDF

Print

----------------------------------------------------
USERS
----------------------------------------------------

Create users

Edit users

Roles

Permissions

----------------------------------------------------
SETTINGS
----------------------------------------------------

Store information

Taxes

Payment methods

Receipt configuration

Printers

Barcode settings

Backup

----------------------------------------------------
DATABASE
----------------------------------------------------

Use Supabase PostgreSQL.

Create a normalized relational database.

Use UUIDs.

Use foreign keys.

Enable Row Level Security.

Prepare the database for future multi-store support.

----------------------------------------------------
UX
----------------------------------------------------

Sidebar collapsible

Professional tables

Pagination

Filters

Global search

Dialogs

Toast notifications

Loading skeletons

Keyboard shortcuts

Confirmation dialogs

Dark mode

Light mode

----------------------------------------------------
HARDWARE READY
----------------------------------------------------

The application must be designed to support:

Thermal printer

Cash drawer

Barcode scanner

QR scanner

Receipt printing

----------------------------------------------------
FUTURE READY
----------------------------------------------------

Structure the project to easily support future modules such as:

Electronic invoicing (DIAN)

Multiple stores

Warehouse management

Online store

Mobile application

WhatsApp integration

Google Drive backups

Analytics

Loyalty program

Gift cards

Coupons

Real-time synchronization

The final result should look like a premium commercial POS that is ready to be sold to multiple businesses, with exceptional user experience, beautiful UI, clean architecture, and highly maintainable code.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
