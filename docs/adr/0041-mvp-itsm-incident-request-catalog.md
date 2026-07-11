# ADR 0041 — MVP ITSM scope: Incidents, Service Requests, and Catalog

- **Status:** accepted
- **Date:** 2026-07-10

## Context

A generic Ticket core alone does not express the key Service Desk distinction
between restoring an interrupted service and fulfilling a requested service.
However, Problem Management, Change Management, and a full CMDB are substantial
domain modules with distinct lifecycle and governance requirements.

## Decision

The ITSM MVP includes **Incidents**, **Service Requests**, and a **Service
Catalog** built on configurable Ticket Forms. **Problem Management**, **Change
Management**, and a complete **CMDB** are deferred to later phases.

## Consequences

- **Easier:** an operationally meaningful Service Desk and structured request
  intake without delaying release for every ITIL practice.
- **Harder:** the Ticket Type model must express Incident versus Service Request
  without hard-coding future practices into the core.
- A lightweight asset reference may be considered later, but it is not a CMDB.
