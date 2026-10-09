# oanastack readiness rubric v1

This rubric adapts the eight pillars and five maturity levels from Factory's
[January 2026 article](https://factory.com/news/agent-readiness). Its criteria,
level assignments, and uncertainty rules below are independently defined. They
are not Factory's official criteria or a promise of an equivalent score.

## Status and scope

| Status | Meaning |
| --- | --- |
| pass | Evidence satisfies the stated requirement. Runtime requirements need execution evidence. |
| fail | Inspection or execution demonstrates the requirement is unmet. |
| unknown | Evidence or platform access is insufficient to decide. |
| blocked | A prerequisite prevents verification; name it. |
| n/a | The capability genuinely does not apply; give an architectural reason. |

Missing platform access is `unknown`, not `n/a` or proof that protection is absent.
A missing dependency is `blocked` for a runtime check; the absence of a reproducible
setup procedure can independently be `fail`. A configured linter can pass a
configuration criterion while its attempted execution is blocked or fails.

Scope `R` is repository-wide. Scope `A` is per independently deployable application.
Shared configuration may satisfy multiple applications only if its include paths,
scripts, and CI actually cover them. Count each applicable A criterion once per
application and each R criterion once. Show the application breakdown.

Accept equivalent controls: a documented environment bootstrap can substitute
for a devcontainer; a platform owner policy can substitute for CODEOWNERS; debt
issues can substitute for TODOs. A library need not have deployment monitoring.
Do not require a particular vendor, cloud, database, language, or framework.

## Criteria

Each row is one requirement, assessed independently. Configuration criteria are
static; words such as “runs”, “demonstrated”, and “measured” require execution
results or authorized recorded evidence. Evidence age and scope must be stated.

| ID | Pillar | Level | Scope | Passing evidence |
| --- | --- | --- | --- | --- |
| SV1 | Style & Validation | 1 | A | A linter or equivalent automated correctness checker is configured for the application's language and source. |
| SV2 | Style & Validation | 2 | A | Type checks or equivalent language checks cover applicable source, and formatting has a documented deterministic check. |
| SV3 | Style & Validation | 3 | R | A portable fast validation entrypoint is enforced before merge; hooks may be optional if CI enforcement is verified. |
| SV4 | Style & Validation | 4 | R | Measured local validation latency meets a documented feedback budget. |
| BS1 | Build System | 1 | A | A discoverable build or package command declares its prerequisites. |
| BS2 | Build System | 2 | A | Dependencies are locked or reproducibly resolved, with a documented bootstrap command. |
| BS3 | Build System | 3 | A | Build/package runs successfully for the assessed revision with identifiable artifacts; applicable target platforms are documented. |
| BS4 | Build System | 4 | A | Build timing is tracked and caching or incremental work is demonstrated to improve feedback. |
| TS1 | Testing | 1 | A | Meaningful unit or behavioral tests exist with a discoverable runner. |
| TS2 | Testing | 2 | A | A representative local test selection runs successfully and uses isolated fixtures. |
| TS3 | Testing | 3 | A | Integration or contract tests exercise a real module boundary, and their required merge checks are verified. |
| TS4 | Testing | 4 | R | Test timing and flaky failures are tracked, with a defined owner and repair or quarantine process. |
| DC1 | Documentation | 1 | R | A current README explains purpose, entrypoints, and setup. |
| DC2 | Documentation | 2 | R | Discoverable agent/contributor instructions explain ownership boundaries and validation commands. |
| DC3 | Documentation | 3 | R | Architecture/request flows and relevant public contracts match inspected source; a documentation maintenance process exists. |
| DC4 | Documentation | 4 | R | Broken instructions or documentation drift are detected through executable examples, link checks, or another demonstrated review mechanism. |
| DE1 | Development Environment | 1 | A | Required tools, services, and configuration names are documented without embedding credentials. |
| DE2 | Development Environment | 2 | A | A portable bootstrap/environment recipe declares version requirements, sample config, and source dependency initialization. |
| DE3 | Development Environment | 3 | A | Setup and representative validation are demonstrated in a fresh or isolated checkout, including applicable service dependencies. |
| DE4 | Development Environment | 4 | R | Parallel work has documented isolation and cleanup, with demonstrated avoidance of port, fixture, and shared-state collisions. |
| CQ1 | Code Quality | 1 | A | Responsibility boundaries and module entrypoints are discoverable in current source. |
| CQ2 | Code Quality | 2 | A | Language-appropriate strictness and architectural/dependency boundaries have automated checks. |
| CQ3 | Code Quality | 3 | R | Maintainability/debt review has a repeatable process with tracked owners and actionable findings. |
| CQ4 | Code Quality | 4 | R | Applicable complexity, duplication, unused dependency, or dead-code signals are measured and acted on. |
| OB1 | Observability | 1 | A | Failures expose actionable diagnostics; services have a health/readiness signal where applicable. |
| OB2 | Observability | 2 | A | Runtime logs/errors carry useful context and relevant sensitive fields are scrubbed. |
| OB3 | Observability | 3 | A | Request correlation and relevant metrics work across the application's runtime boundaries; operational runbooks are discoverable. |
| OB4 | Observability | 4 | A | Applicable alerts or performance budgets are connected to an owner and have a demonstrated response/verification loop. |
| SG1 | Security & Governance | 1 | R | Local secret/artifact files are excluded and credential provisioning is documented. Ignore rules alone do not establish that history contains no secrets. |
| SG2 | Security & Governance | 2 | R | Review ownership and required merge protections are verified in repository/platform configuration. |
| SG3 | Security & Governance | 3 | R | Secret scanning and applicable dependency/source vulnerability scanning run with a defined handling policy. |
| SG4 | Security & Governance | 4 | R | Release identity, staged rollout where applicable, and recovery/rollback are documented and demonstrated. |
| AU1 | Cross-pillar autonomy | 5 | R | Agents can discover and scope actionable work through maintained issues/specs with acceptance criteria. |
| AU2 | Cross-pillar autonomy | 5 | R | A recorded agent task completes implementation, verification, and a reviewable handoff using the repository workflow. |
| AU3 | Cross-pillar autonomy | 5 | R | Runtime/CI failures can be linked to actionable work through a demonstrated diagnostic feedback loop. |
| AU4 | Cross-pillar autonomy | 5 | R | Repeated evidence drives improvements to instructions/tooling, with measured outcomes and explicit human authority boundaries. |

## Maturity and scoring

Use these names: L1 Functional, L2 Documented, L3 Standardized, L4 Optimized,
L5 Autonomous. This rubric has eight criteria at each of L1–L4 before application
expansion, and four cross-pillar criteria at L5.

For each level show `pass / applicable`, plus fail, unknown, blocked, and n/a
counts. `applicable = pass + fail + unknown + blocked`; only justified n/a rows
are excluded. Confirm a level only if at least 80% of the applicable criteria
**in that level and in every preceding level separately** pass. Do not round up
to cross the threshold. Higher-level wins cannot compensate for lower-level gaps.

If L1 does not meet the threshold, report “below confirmed L1”. If a level has
zero applicable criteria, report it as unassessed and do not award that level or
higher. Unknown and blocked rows are not claims of poor engineering; they limit
what this assessment can confirm. Show a provisional upper bound if useful by
treating those rows as potentially passing; never merge it with the confirmed result.

Prefer per-level and per-application counts over an aggregate percentage. If an
overall pass rate is requested, label it “oanastack v1 observed pass rate” and
give the denominator and uncertainty counts. A runtime failure after valid
configuration remains a separate reported observation; it must not be hidden
by a configuration pass.

## Priority guidance

Start with blockers to setup and meaningful local feedback. Then close missing
application coverage, unenforced checks, and security/data boundaries. Pursue
performance measurement and autonomous loops after the foundations work.
Recommend controls proportional to the project; avoid adding tools solely to
earn a criterion. Give each action a concrete acceptance condition and estimated
effort rather than a vendor shopping list.
