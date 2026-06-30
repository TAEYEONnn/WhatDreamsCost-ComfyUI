# Upstream Status

## Fork vs Upstream Summary

| | URL |
|---|---|
| origin (fork) | https://github.com/TAEYEONnn/WhatDreamsCost-ComfyUI |
| upstream (original) | https://github.com/WhatDreamsCost/WhatDreamsCost-ComfyUI |

## Current Fork State

- Branch: `main`
- Latest commit: `0dfa657 Merge pull request #145 from Lemonlemons/main`

## Checking Upstream Diff (run locally)

```bash
cd vendor/WhatDreamsCost-ComfyUI
git fetch upstream
git log --oneline --left-right --cherry-pick main...upstream/main -20
```

## Notes

- The remote execution environment restricts access to repositories outside the session scope.
- Run the diff check locally to see which upstream commits are not yet in the fork.
- The fork is at parity with the original as of the session start (no diverging custom commits).
- Do NOT merge upstream changes automatically — review the diff first.

## Protocol

1. `git fetch upstream` to get the latest from original repo
2. `git log --oneline --left-right main...upstream/main` to see divergence
3. Review each upstream commit for relevance
4. Cherry-pick or merge specific commits as needed
5. Test against ComfyUI before merging
