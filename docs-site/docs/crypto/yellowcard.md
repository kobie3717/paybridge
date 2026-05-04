# Yellow Card

African crypto on/off-ramp provider.

::: warning EXPERIMENTAL
Yellow Card driver is marked `@experimental`. No public API spec available. Endpoint paths, headers, and signature schemes are speculative.

**Do not use in production** without partner-confirmed API documentation.
:::

## Configuration

```typescript
import { CryptoRamp } from 'paybridge/crypto';

const ramp = new CryptoRamp({
  provider: 'yellowcard',
  credentials: {
    apiKey: 'your_api_key',
    secretKey: 'your_secret_key'
  },
  sandbox: true
});
```

## Status

- Implementation exists but is untested against live API
- Logs a warning on instantiation
- Will not work without partner integration documentation

## Next steps

If you have access to Yellow Card partner API docs, please open an issue on GitHub to help verify the implementation.

## Documentation

- Partner API docs not publicly available
