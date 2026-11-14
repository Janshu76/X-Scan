# TerraWatch data

This directory holds the dataset catalog and small, curated sample data used
by the Mexico City MVP. Keep samples small and record their source, license,
and any preparation steps in the catalog and in
[`../docs/data-sources.md`](../docs/data-sources.md).

## Original satellite files

Store original satellite files outside this Git repository, such as on a
separate drive or in cloud object storage. Configure the application with the
path or URI to that storage rather than committing original imagery here.
`data/originals/` is ignored by Git as a safeguard if originals are temporarily
placed under this directory.

## Mexico City sample

The `samples/mexico_city/` folder contains the compact series metadata and
date overlays used by the static web app. The Next.js predev and prebuild steps
stage these files, plus the AOI, into the generated `public/data/` folder.
Assam and Antarctica remain empty future sample locations.
