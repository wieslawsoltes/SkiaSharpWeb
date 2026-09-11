# Font fixtures

`create-fixtures.py` regenerates the original synthetic CFF1, CFF2 variable, COLR/CPAL, COLRv1 gradient, sbix, OpenType SVG, TTF and WOFF fixtures with Python fonttools and pillow. Install the Python brotli module to regenerate the WOFF2 fixture. The browser runtime uses none of these Python dependencies.

`RobotoFlex-Variable.woff2` is the unmodified file `files/roboto-flex-latin-wght-normal.woff2` from npm package `@fontsource-variable/roboto-flex@5.2.8`. Its font license is `RobotoFlex-OFL.txt`.

The `RobotoFlex-Regular.otf` and `RobotoFlex-Black.otf` temporary files, if present in developer staging, are transient PDF validation outputs and are not required fixtures. Omit them from distribution.
