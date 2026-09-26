# Data Bootstrap and Seed Plan

## Principle
Production must never receive arbitrary demo products or fake orders. Database structure comes from migrations; production business content is loaded intentionally.

## Production-safe bootstrap
A one-time command must:
1. verify database connection;
2. verify migrations are current;
3. create exactly one admin if no admin exists, otherwise refuse;
4. initialize store settings if absent;
5. initialize the five main categories if absent;
6. initialize the WhatsApp number as `+201019003677` if absent;
7. initialize Arabic/RTL/EGP defaults;
8. exit without touching existing products/orders/customers/inventory.

The command must never print passwords or connection strings.

## Development seed
A separate explicit development seed may insert:
- five main categories;
- representative child categories;
- sample products across all departments;
- variants demonstrating:
  - default/no-option product;
  - size-only product;
  - color-only product;
  - size+color product;
  - a cosmetics volume/shade product;
- sample stock values;
- sample approved/pending reviews;
- sample WhatsApp testimonials with clearly marked demo assets;
- sample homepage content;
- a development admin account only when explicitly requested by the developer and never using a real production password.

## No fake production orders
Do not create fake customer orders in Production.

## Seed idempotency
Running development seed twice must not create duplicate SKUs, categories, or settings. Use deterministic IDs/slugs or upsert strategy.

## Real content handoff
Before launch, the owner replaces demo images/text/products with real catalog data through Admin or a controlled content import process.

## Data import option
If bulk product import is added later, it must validate:
- category slug
- product name
- SKU uniqueness
- variant definitions
- prices
- stock integers
- image URLs/media references
- no duplicate attribute values in one variant
- no negative stock

Invalid rows must be rejected with row-specific error reports rather than partially importing silently.
