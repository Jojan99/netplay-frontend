# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Small internet service providers (ISPs) in Colombia run their whole operation in this panel. Every role uses the Clientes screen:

- **Atención al cliente**: answers WhatsApp and phone calls all day with the customer waiting. Finds the client, checks whether they paid, reactivates the service, creates tickets.
- **Cartera / cobros**: reviews who owes, applies payments and payment proofs, suspends and reactivates.
- **Administrador / dueño**: watches the overall state, decides and configures.
- **Técnicos**: on the phone, in the field. They see the client's equipment and signal, reboot it and install.

The staff are not technical: words like PPPoE, VLAN, TR-069 or dBm mean little to most of them.

## Product Purpose

Netvula is a multi-company platform, served under `<empresa>.netvula.com`. Netplay SAS is the first and largest tenant; GLOBAL INFINET and skartelecon are others. It manages:

- clients and their internet service (MikroTik router, OLT and ONT, TR-069);
- monthly billing, electronic invoicing, payments, online payments (Wompi, Nequi push) and payment-proof review;
- WhatsApp support and collections;
- installations, field technicians and the network map.

Success: a non-technical office worker resolves a customer's request in seconds, while the customer is still on the chat.

## Positioning

One panel that joins the network, the money and the conversation for the same client. It shows whether the client paid, whether their equipment is on, and what they wrote on WhatsApp, and acts on all three (reactivate, reboot the ONT, apply a payment) without leaving the client.

## Operating Context

- Office desktop browsers all day, often with WhatsApp open beside them.
- The same panel is used on phones, through the browser and a Capacitor app for technicians. Technicians work outdoors, one-handed, with poor signal.
- Spanish (Colombia), formal "usted". Money is in pesos written as `$ 75.000`.
- About 1,100 clients per company, with long Colombian names, cédulas, barrios and addresses.

## Capabilities and Constraints

- Angular 17 standalone frontend with a custom `np-*` design system in `src/theme/`. Laravel backend. Pages are prerendered (SSR-safe code required).
- **Light and dark mode must both stay.** Users choose.
- **It must work well on phones.**
- **Branding is per company:** a common Netvula base, where each ISP sets its own color and logo. The design must not hard-depend on one company's accent.
- Menu access is permission-based per profile (modules). Entries and permissions must not change in a redesign.
- Client states in plain words: "Con servicio", "Suspendido por mora", "Suspendido por un tiempo", "Sin conexión asignada", "Pagó y sigue suspendido".

## Brand Commitments

- The owner gave **visual freedom** beyond the constraints above.
- **Keep the current visual system (owner decision, 2026-10-16).**
  - After reviewing seven alternative directions (A–G), the owner chose to keep the current platform design: the np-* console theme in `src/theme/`, with its fonts, accent, light and dark modes.
  - Improvements are refinements inside that system: clarity, hierarchy, plain words, bigger targets. They are never a new visual world. Do not propose a visual redesign unless the owner asks for one.
- Earlier exploration (superseded by the decision above). **Reference bar, set by the owner on 2026-10-16:** the vivid, friendly color and big confident money/cards of Colombian fintech apps (Nequi, Daviplata, Bancolombia), combined with the cleanliness and order of Linear, Notion and Stripe.
  - The owner rejected the earlier directions as boring and old-fashioned, and disliked their colors: teal/green consoles, utility-bill blue, cream, indigo SaaS, dark navy and coral.
- Netvula is the platform name. Each tenant shows its own name, logo and color.

## Evidence on Hand

Real client data exists in production but must not appear in mockups: use realistic invented Colombian names. There are no testimonials, customer quotes or metrics to cite.

## Product Principles

1. Answer "¿pagó?, ¿tiene servicio?, ¿qué hago?" before anything else.
2. Plain words first; technical detail is there for whoever opens it.
3. Color means "attend to this", never decoration.
4. One obvious next action per moment; the rest stays one click away.
5. Never lose information or money: payments and proofs are sacred.

## Accessibility & Inclusion

Text contrast at least 4.5:1, touch targets at least 44 px on phones, and states never conveyed by color alone.
