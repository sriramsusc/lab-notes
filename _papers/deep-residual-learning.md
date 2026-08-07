---
uid: "deep-residual-learning"
title: "Deep Residual Learning for Image Recognition"
authors: "He, Zhang, Ren, Sun"
year: "2016"
venue: "CVPR"
link: "https://arxiv.org/abs/1512.03385"
status: to-read
assigned_to: "Professor"
priority: "Medium"
tags: ["vision", "optimization", "architectures"]
why: |-
  We keep invoking "residual connections help optimization" without having read the
  original argument for why. Worth doing properly before the next draft.
added: 2026-08-06
added_by: sriramsusc
issue: 2
---

## Initial notes

Focus on Section 3.1 and the degradation experiments — the claim we actually care
about is that deeper plain networks do worse in *training* error, which rules out
overfitting as the explanation.
