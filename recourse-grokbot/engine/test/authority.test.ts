import test from "node:test";
import assert from "node:assert/strict";
import { checkRelationshipWarrant } from "../src/authority/relationshipValidator.ts";
import { resolveAuthority } from "../src/authority/authorityResolver.ts";
import { captureSource, hashContent, SourceStore } from "../src/warrant/sourceStore.ts";
import type { CandidateSourceRelationship, PolicySource, ValidatedSourceRelationship } from "../src/types/authority.ts";

const CAMPUS_TEXT =
  "The Student Academic Grievance Policy and Procedures govern all academic grievances university-wide.";
const COLLEGE_TEXT =
  "This College of Applied Health Sciences procedure implements the campus-wide Student Academic Grievance Policy and adds discipline-specific detail for clinical placement grievances.";
const NEWER_TEXT = "This 2026 revision supersedes the version of this policy effective 2017-04-27.";
const FAQ_TEXT = "This FAQ page explains, in plain language, how the grievance policy works; it is not itself policy.";

function store() {
  return new SourceStore([
    captureSource({ sourceId: "campus", requestedUrl: "https://uic.edu/campus", retrievedAt: "2026-01-01T00:00:00Z", content: CAMPUS_TEXT }),
    captureSource({ sourceId: "college", requestedUrl: "https://uic.edu/college", retrievedAt: "2026-01-01T00:00:00Z", content: COLLEGE_TEXT }),
    captureSource({ sourceId: "newer", requestedUrl: "https://uic.edu/newer", retrievedAt: "2026-01-01T00:00:00Z", content: NEWER_TEXT }),
    captureSource({ sourceId: "faq", requestedUrl: "https://uic.edu/faq", retrievedAt: "2026-01-01T00:00:00Z", content: FAQ_TEXT }),
  ]);
}

function relCandidate(overrides: Partial<CandidateSourceRelationship> = {}, warrantOverrides: Record<string, unknown> = {}): CandidateSourceRelationship {
  return {
    id: "rel-1",
    type: "IMPLEMENTS",
    fromSourceId: "college",
    toSourceId: "campus",
    warrant: {
      sourceId: "college",
      contentHash: hashContent(COLLEGE_TEXT),
      span: { start: 0, end: COLLEGE_TEXT.length },
      quotedText: COLLEGE_TEXT,
      claimType: "directly_stated",
      ...warrantOverrides,
    },
    ...overrides,
  };
}

function validated(
  overrides: Partial<CandidateSourceRelationship> = {},
  warrantOverrides: Record<string, unknown> = {}
): ValidatedSourceRelationship {
  const outcome = checkRelationshipWarrant(relCandidate(overrides, warrantOverrides), store());
  assert.equal(outcome.status, "auto_promotable", "test setup expected a valid relationship");
  if (outcome.status !== "auto_promotable") throw new Error("unreachable");
  return outcome.relationship;
}

// ---- relationshipValidator ----

test("a relationship with no warrant at all is rejected", () => {
  const outcome = checkRelationshipWarrant(relCandidate({ warrant: undefined }), store());
  assert.equal(outcome.status, "rejected");
  if (outcome.status === "rejected") assert.ok(outcome.errors.some((e) => e.field === "warrant"));
});

test("a self-referential relationship (fromSourceId === toSourceId) is rejected", () => {
  const outcome = checkRelationshipWarrant(relCandidate({ toSourceId: "college" }), store());
  assert.equal(outcome.status, "rejected");
  if (outcome.status === "rejected") assert.ok(outcome.errors.some((e) => e.field === "toSourceId"));
});

test("an unrecognized relationship type is rejected", () => {
  const outcome = checkRelationshipWarrant(relCandidate({ type: "PRECEDES" as never }), store());
  assert.equal(outcome.status, "rejected");
  if (outcome.status === "rejected") assert.ok(outcome.errors.some((e) => e.field === "type"));
});

test("a warrant anchored in toSourceId instead of fromSourceId is rejected -- precedence cannot be warranted from the wrong document", () => {
  const outcome = checkRelationshipWarrant(
    relCandidate({}, { sourceId: "campus", contentHash: hashContent(CAMPUS_TEXT), span: { start: 0, end: CAMPUS_TEXT.length }, quotedText: CAMPUS_TEXT }),
    store()
  );
  assert.equal(outcome.status, "rejected");
  if (outcome.status === "rejected") assert.ok(outcome.errors.some((e) => e.field === "warrant.sourceId"));
});

test("a fabricated quote for a relationship claim is rejected", () => {
  const outcome = checkRelationshipWarrant(relCandidate({}, { quotedText: "This page has nothing to do with any other policy." }), store());
  assert.equal(outcome.status, "rejected");
  if (outcome.status === "rejected") assert.ok(outcome.errors.some((e) => e.field === "warrant.quotedText"));
});

test("a correctly warranted, directly-stated relationship is auto-promotable", () => {
  const outcome = checkRelationshipWarrant(relCandidate(), store());
  assert.equal(outcome.status, "auto_promotable");
});

test("an 'inferred' relationship claim fails into review, never auto-promoted -- precedence is never inferred from URL/domain/title", () => {
  const outcome = checkRelationshipWarrant(relCandidate({}, { claimType: "inferred" }), store());
  assert.equal(outcome.status, "needs_review");
});

// ---- authorityResolver ----

const campusSource: PolicySource = {
  sourceId: "campus",
  institution: "UIC",
  authorityLevel: "campus_wide",
  scope: { institution: "UIC", decisionTypes: ["academic_grievance"] },
  effective: { effectiveDate: "2017-04-27" },
};

const collegeSource: PolicySource = {
  sourceId: "college",
  institution: "UIC",
  authorityLevel: "college_level",
  scope: { institution: "UIC", unit: "Applied Health Sciences", decisionTypes: ["academic_grievance"] },
  effective: { effectiveDate: "2017-04-27" },
};

const newerCampusSource: PolicySource = {
  sourceId: "newer",
  institution: "UIC",
  authorityLevel: "campus_wide",
  scope: { institution: "UIC", decisionTypes: ["academic_grievance"] },
  effective: { effectiveDate: "2026-08-01" },
};

const faqSource: PolicySource = {
  sourceId: "faq",
  institution: "UIC",
  authorityLevel: "campus_wide",
  scope: { institution: "UIC", decisionTypes: ["academic_grievance"] },
  effective: { effectiveDate: "2017-04-27" },
};

function baseQuery(overrides: Partial<{ institution: string; decisionType: string; unit?: string; studentType?: string; asOf: string }> = {}) {
  return {
    institution: "UIC",
    decisionType: "academic_grievance",
    asOf: "2026-09-06T00:00:00Z",
    ...overrides,
  };
}

test("a single matching source with no competing claims resolves APPLICABLE", () => {
  const result = resolveAuthority([campusSource], [], baseQuery());
  assert.equal(result.status, "APPLICABLE");
  if (result.status === "APPLICABLE") assert.equal(result.governingSourceId, "campus");
});

test("no source matching institution/decision type resolves BLOCKED_SOURCE_UNAVAILABLE", () => {
  const result = resolveAuthority([campusSource], [], baseQuery({ decisionType: "title_ix" }));
  assert.equal(result.status, "BLOCKED_SOURCE_UNAVAILABLE");
});

test("a college-level source is not matched when the query does not name that unit -- no silent broadening of scope", () => {
  const result = resolveAuthority([collegeSource], [], baseQuery());
  assert.equal(result.status, "BLOCKED_SOURCE_UNAVAILABLE");
});

test("case-07 style conflict: two sources with no validated relationship between them resolve BLOCKED_SOURCE_CONFLICT, never a silent pick", () => {
  const result = resolveAuthority([campusSource, collegeSource], [], baseQuery({ unit: "Applied Health Sciences" }));
  assert.equal(result.status, "BLOCKED_SOURCE_CONFLICT");
  if (result.status === "BLOCKED_SOURCE_CONFLICT") {
    assert.ok(result.candidateSourceIds.includes("campus"));
    assert.ok(result.candidateSourceIds.includes("college"));
  }
});

test("a validated IMPLEMENTS relationship resolves the campus policy as governing and the college page as supporting detail", () => {
  const rel = validated();
  const result = resolveAuthority([campusSource, collegeSource], [rel], baseQuery({ unit: "Applied Health Sciences" }));
  assert.equal(result.status, "APPLICABLE");
  if (result.status === "APPLICABLE") {
    assert.equal(result.governingSourceId, "campus");
    assert.deepEqual(result.supportingSourceIds, ["college"]);
  }
});

test("an unwarranted (inferred, not-yet-validated) relationship cannot be fed to the resolver -- the type system requires ValidatedSourceRelationship", () => {
  const outcome = checkRelationshipWarrant(relCandidate({}, { claimType: "inferred" }), store());
  assert.equal(outcome.status, "needs_review");
  // Only a "validated"/ValidatedSourceRelationship array is an acceptable
  // second argument to resolveAuthority -- there is no path from this
  // needs_review outcome into resolution without a human first promoting it.
  const result = resolveAuthority([campusSource, collegeSource], [], baseQuery({ unit: "Applied Health Sciences" }));
  assert.equal(result.status, "BLOCKED_SOURCE_CONFLICT");
});

test("a source that is only GUIDANCE_FOR another can never be selected as governing, even if it is the only scope match", () => {
  const guidanceRel = validated(
    { id: "rel-faq", type: "GUIDANCE_FOR", fromSourceId: "faq", toSourceId: "campus" },
    { sourceId: "faq", contentHash: hashContent(FAQ_TEXT), span: { start: 0, end: FAQ_TEXT.length }, quotedText: FAQ_TEXT }
  );
  const result = resolveAuthority([faqSource], [guidanceRel], baseQuery());
  assert.equal(result.status, "BLOCKED_SOURCE_UNAVAILABLE");
});

test("a GUIDANCE_FOR source alongside its governing source is excluded from the governing pick and from supportingSourceIds", () => {
  const guidanceRel = validated(
    { id: "rel-faq", type: "GUIDANCE_FOR", fromSourceId: "faq", toSourceId: "campus" },
    { sourceId: "faq", contentHash: hashContent(FAQ_TEXT), span: { start: 0, end: FAQ_TEXT.length }, quotedText: FAQ_TEXT }
  );
  const result = resolveAuthority([campusSource, faqSource], [guidanceRel], baseQuery());
  assert.equal(result.status, "APPLICABLE");
  if (result.status === "APPLICABLE") {
    assert.equal(result.governingSourceId, "campus");
    assert.deepEqual(result.supportingSourceIds, []);
  }
});

test("case-08 style staleness: a SUPERSEDES relationship does not take effect before the newer source's own effective date", () => {
  const rel = validated(
    { id: "rel-super", type: "SUPERSEDES", fromSourceId: "newer", toSourceId: "campus" },
    { sourceId: "newer", contentHash: hashContent(NEWER_TEXT), span: { start: 0, end: NEWER_TEXT.length }, quotedText: NEWER_TEXT }
  );
  const result = resolveAuthority(
    [campusSource, newerCampusSource],
    [rel],
    baseQuery({ asOf: "2026-01-01T00:00:00Z" }) // before newer's 2026-08-01 effective date
  );
  assert.equal(result.status, "APPLICABLE");
  if (result.status === "APPLICABLE") assert.equal(result.governingSourceId, "campus");
});

test("a SUPERSEDES relationship retires the older version once the newer source's effective date has arrived", () => {
  const rel = validated(
    { id: "rel-super", type: "SUPERSEDES", fromSourceId: "newer", toSourceId: "campus" },
    { sourceId: "newer", contentHash: hashContent(NEWER_TEXT), span: { start: 0, end: NEWER_TEXT.length }, quotedText: NEWER_TEXT }
  );
  const result = resolveAuthority(
    [campusSource, newerCampusSource],
    [rel],
    baseQuery({ asOf: "2026-09-06T00:00:00Z" }) // after newer's 2026-08-01 effective date
  );
  assert.equal(result.status, "APPLICABLE");
  if (result.status === "APPLICABLE") assert.equal(result.governingSourceId, "newer");
});

test("a lineage cycle (A EXTENDS B, B EXTENDS A) resolves BLOCKED_SOURCE_CONFLICT rather than picking either arbitrarily", () => {
  const aToB = validated({ id: "rel-a-b", type: "EXTENDS", fromSourceId: "college", toSourceId: "campus" });
  const bToA = validated(
    { id: "rel-b-a", type: "EXTENDS", fromSourceId: "campus", toSourceId: "college" },
    { sourceId: "campus", contentHash: hashContent(CAMPUS_TEXT), span: { start: 0, end: CAMPUS_TEXT.length }, quotedText: CAMPUS_TEXT }
  );
  const result = resolveAuthority([campusSource, collegeSource], [aToB, bToA], baseQuery({ unit: "Applied Health Sciences" }));
  assert.equal(result.status, "BLOCKED_SOURCE_CONFLICT");
});
