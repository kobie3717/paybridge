import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'PayBridge',
  description: 'One API for fiat + crypto payments. Multi-provider routing, automatic failover, MoonPay on/off-ramp.',
  cleanUrls: true,
  base: '/paybridge/',

  themeConfig: {
    nav: [
      { text: 'Getting started', link: '/getting-started' },
      { text: 'Providers', link: '/providers/overview' },
      { text: 'Routing', link: '/routing/overview' },
      { text: 'Crypto', link: '/crypto/overview' },
      { text: 'CLI', link: '/cli' },
      { text: 'GitHub', link: 'https://github.com/kobie3717/paybridge' },
      { text: 'npm', link: 'https://www.npmjs.com/package/paybridge' },
    ],

    sidebar: {
      '/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is PayBridge?', link: '/' },
            { text: 'Getting started', link: '/getting-started' },
            { text: 'Migration guide', link: '/migration' },
          ]
        },
        {
          text: 'Providers',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/providers/overview' },
            { text: 'SoftyComp', link: '/providers/softycomp' },
            { text: 'Yoco', link: '/providers/yoco' },
            { text: 'Ozow', link: '/providers/ozow' },
            { text: 'PayFast', link: '/providers/payfast' },
            { text: 'PayStack', link: '/providers/paystack' },
            { text: 'Stripe', link: '/providers/stripe' },
            { text: 'Peach Payments', link: '/providers/peach' },
            { text: 'Flutterwave', link: '/providers/flutterwave' },
            { text: 'Adyen', link: '/providers/adyen' },
            { text: 'Mercado Pago', link: '/providers/mercadopago' },
            { text: 'Razorpay', link: '/providers/razorpay' },
            { text: 'Mollie', link: '/providers/mollie' },
            { text: 'Square', link: '/providers/square' },
            { text: 'Pesapal', link: '/providers/pesapal' },
          ]
        },
        {
          text: 'Crypto',
          collapsed: true,
          items: [
            { text: 'Overview', link: '/crypto/overview' },
            { text: 'MoonPay', link: '/crypto/moonpay' },
            { text: 'Yellow Card', link: '/crypto/yellowcard' },
            { text: 'Transak', link: '/crypto/transak' },
            { text: 'Ramp Network', link: '/crypto/ramp' },
          ]
        },
        {
          text: 'Routing',
          collapsed: true,
          items: [
            { text: 'Overview', link: '/routing/overview' },
            { text: 'Strategies', link: '/routing/strategies' },
            { text: 'Circuit Breaker', link: '/routing/circuit-breaker' },
            { text: 'Crypto Router', link: '/routing/crypto-router' },
          ]
        },
        {
          text: 'Webhooks',
          collapsed: true,
          items: [
            { text: 'Overview', link: '/webhooks/overview' },
            { text: 'Signature Verification', link: '/webhooks/signature-verification' },
            { text: 'Idempotency', link: '/webhooks/idempotency' },
            { text: 'Replay Protection', link: '/webhooks/replay-protection' },
          ]
        },
        {
          text: 'Observability',
          collapsed: true,
          items: [
            { text: 'Events', link: '/observability/events' },
            { text: 'Ledger', link: '/observability/ledger' },
            { text: 'Tracing', link: '/observability/tracing' },
          ]
        },
        {
          text: 'Reference',
          collapsed: true,
          items: [
            { text: 'CLI', link: '/cli' },
            { text: 'Types', link: '/reference/types' },
            { text: 'Errors', link: '/reference/errors' },
            { text: 'Examples', link: '/examples' },
            { text: 'Stability Policy', link: '/stability' },
          ]
        },
      ],
    },

    search: { provider: 'local' },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/kobie3717/paybridge' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Kobie Wentzel',
    },

    editLink: {
      pattern: 'https://github.com/kobie3717/paybridge/edit/master/docs-site/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },
});
