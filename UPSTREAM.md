# Upstream and implementation scope

Behavior reference: https://github.com/coctostan/pi-hashline-readmap

Reference revision recorded on 2026-11-02: `38ab735dd3739e8d0e4a41e5e0e009c6fd541535`. The source inspection used upstream `main`; the recorded revision identifies that research snapshot, not a dependency that this package downloads or executes.

## Source consulted

- [src/hashline.ts](https://github.com/coctostan/pi-hashline-readmap/blob/38ab735dd3739e8d0e4a41e5e0e009c6fd541535/src/hashline.ts)
- [src/fs-write.ts](https://github.com/coctostan/pi-hashline-readmap/blob/38ab735dd3739e8d0e4a41e5e0e009c6fd541535/src/fs-write.ts)
- [src/path-utils.ts](https://github.com/coctostan/pi-hashline-readmap/blob/38ab735dd3739e8d0e4a41e5e0e009c6fd541535/src/path-utils.ts)

## Attribution

Upstream is MIT, copyright (c) 2026 Maxwell Newman. See the upstream [LICENSE](https://github.com/coctostan/pi-hashline-readmap/blob/38ab735dd3739e8d0e4a41e5e0e009c6fd541535/LICENSE) and this package's [NOTICE](NOTICE) for its full license text.

This is an independently written DSH behavior port. No upstream implementation source was copied. It uses DSH 0.2.1-rc.2 named plugin exports and real ToolRuntime definitions with mandatory canonical output schemas; it does not adapt or load the Pi runtime. No Pi or upstream runtime dependency is installed by this package.

The local code is MIT, copyright (c) 2026 LIghtJUNction, under [LICENSE](LICENSE). The narrower supported behavior, changed interfaces, host-local filesystem boundary and omitted upstream features are documented in [README.md](README.md). Passing local offline tests is not a claim of full upstream parity, remote-world support, published npm packages, or live-provider acceptance.

The upstream hashline engine also credits MIT-licensed oh-my-pi (`can1357/oh-my-pi`). This implementation does not vendor that engine, xxhash-wasm, diff, relocation logic or its patches; SHA-256 anchors and strict revision checking are implemented independently.
