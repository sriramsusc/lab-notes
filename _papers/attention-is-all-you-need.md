---
uid: "attention-is-all-you-need"
title: "Attention Is All You Need"
authors: "Vaswani, Shazeer, Parmar, Uszkoreit, Jones, Gomez, Kaiser, Polosukhin"
published: "June 2017"
venue: "NeurIPS"
link: "https://arxiv.org/abs/1706.03762"
doi: "10.48550/arXiv.1706.03762"
status: summarized
priority: "High"
tags: ["transformers", "attention", "architectures"]
why: |-
  It is the reference point for every sequence architecture we are considering,
  so we should be able to argue about its design choices from memory.
added: 2026-08-01
added_by: sriramsusc
issue: 1
summarized_on: 2026-08-05
summarized_by: "Sriram"
relevance: "Core — I should build on this"
---

## Problem and motivation

Sequence transduction models at the time were built on recurrent or convolutional
encoders and decoders, with attention bolted on as a way for the decoder to look
back at encoder states. Recurrence forces computation to be sequential in the
position index, which caps how much of a long sequence you can process in parallel
and makes gradients travel a long path between distant positions. The paper asks
whether the recurrence is doing any necessary work at all, or whether attention
alone is sufficient.

## Method

The Transformer keeps the encoder-decoder shape but replaces recurrence entirely
with stacked self-attention and position-wise feed-forward layers. Scaled
dot-product attention scores queries against keys, divides by the square root of
the key dimension to keep softmax gradients from vanishing, and takes a weighted
sum of values. Multi-head attention runs several of these in parallel on projected
subspaces so different heads can attend to different relations at once. Because
the model has no notion of order, sinusoidal positional encodings are added to the
input embeddings. Residual connections and layer normalization wrap every
sublayer, and the decoder masks future positions to preserve autoregressive
generation.

## Key results

On WMT 2014 English-to-German the big model reaches 28.4 BLEU, about two points
above the previous best including ensembles, and on English-to-French it reaches
41.8 BLEU. The headline is really the cost: those numbers come from 3.5 days on
eight GPUs, a small fraction of what the recurrent baselines needed. Ablations show
multi-head attention beats single-head, that quality degrades when key dimension is
reduced too far, and that learned positional embeddings perform about the same as
the sinusoidal ones. A constituency parsing experiment suggests the architecture
generalizes past translation.

## Takeaways for my work

The practical lesson is that removing a sequential dependency can buy more than a
better inductive bias does — the win here is as much about training throughput as
about modeling. Worth noting for us: attention is quadratic in sequence length, so
the parallelism argument weakens as sequences grow, which is exactly the regime we
care about. We should treat the base model as our baseline rather than the big one,
since our compute budget is closer to theirs.

## Limitations and open questions

The evaluation is narrow — two translation pairs and one parsing task — so claims
about general sequence transduction are extrapolation. There is no analysis of how
performance scales with sequence length, which is the thing most likely to bite us.
The positional encoding choice is asserted more than justified.

## Related work and follow-ups

Worth adding to the queue: the original attention paper by Bahdanau et al., and at
least one of the efficient-attention follow-ups to see how the quadratic cost is
actually addressed in practice.
