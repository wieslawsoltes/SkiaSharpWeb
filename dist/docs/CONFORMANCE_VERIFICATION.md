# Conformance verification — 0.4

The pinned inventory contains all 3,995 original declarations: **1936 implemented, 1042 partial/unverified, 873 browser-inapplicable and 144 missing**. These are declaration counts, not feature percentages.

The 0.4 review adds concrete certificates for native memory callbacks, singular matrix/clip accessors and both asynchronous Graphite readback signatures. Eleven rows were reviewed; four additional rows change to implemented compared with the unextended audit rules. Other argument-space, pointer, hash and format differences stay explicit. Original IDs, signatures and lexical corrections are preserved.

The 144 missing rows are 130 desktop Vulkan/Metal/Direct3D declarations and 14 CLR native-object/locking/COM declarations. They are listed in remaining-declarations.json, not silently relabeled as completed web APIs.

Fresh .NET 3.119.0 and 4.154 preview executions each pass 39,224 seeded geometry comparisons; text/value/font references are checked separately. Chromium runs 44 scenes per rendering backend and additional HDR/cache/lifecycle checks. SwiftShader is a software GPU adapter; neither physical-GPU validation nor exhaustive .NET/OpenType/Lottie conformance is claimed.

See [the release evidence](./RELEASE-0.4.md) and [the complete audit](./OVERLOAD_CONFORMANCE.md). Run npm run coverage to regenerate this release's signature rows.
