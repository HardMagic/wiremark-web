# Public-surface gate fixtures

`node scripts/check-public-surface.mjs --self-test` runs the gate's rules on
these files: every `bad-<rule>[-N].html` must trip `<rule>` and every
`good*.html` must pass. They are never published (`scripts/build-site.sh`
copies only the site's own files). Add a fixture with every new rule.
