# Case 09 — Business/working-day calculation edge case

**Institutions:** Kent State University (primary) and University of Westminster (comparative)
**Decision type:** Academic complaint (Kent State) / mitigating-circumstances-linked academic appeal (Westminster)
**Official sources:**
- Kent State: https://www.kent.edu/policyreg/administrative-policy-and-procedure-student-academic-complaints (Policy 3342-4-02.3) and https://www.kent.edu/sites/default/files/Policy-Regarding-Student-Academic-Complaints.pdf
- Westminster: https://www.westminster.ac.uk/current-students/guides-and-policies/academic-matters/academic-appeals and https://www.westminster.ac.uk/sites/default/public-files/general-documents/academic-regulations-section-11-Mitigating-Circumstances.pdf

**Source verification status:** `search_snippet_only` for both.

## Exact relevant rules (as surfaced by search)

Kent State: > All references to "days" refer to weekdays during fall and spring semesters on which classes are conducted, excluding examination week.

Westminster: > A working day is a day, other than a Saturday, Sunday or bank holiday, when the University is open... if today is Tuesday and there are no public holidays this week or next week, the next five working days would be Wednesday, Thursday, Friday, Monday, Tuesday. [Academic appeals must be raised within 15 working days of the decision.]

These two rules are genuinely different in kind, which is the point of pairing them: Westminster's rule is "skip weekends and bank holidays" (a modest adjustment to calendar-day counting). Kent State's rule is far more aggressive — it defines "day" as existing **only** during in-session fall/spring weekdays, excluding exam week entirely, which means the clock **does not run at all** during summer, winter break, spring break, or exam week, however long those are.

## Synthetic student input (Kent State)

> "I got a letter about an academic complaint decision from my department at Kent State on the last Friday of exam week in December, right before winter break. The letter says I have 10 days to escalate. When is that actually due?"

## Expected structured result

```json
{
  "state": "READY_FOR_HUMAN",
  "student_obligation_status": [
    {
      "obligation_id": "escalate_academic_complaint",
      "party": "student",
      "computed_from": "Policy 3342-4-02.3: 'days' = weekdays during fall/spring semesters on which classes are conducted, excluding examination week. Notice issued during exam week itself, immediately followed by winter break (non-instructional). The 10-day clock does not begin accruing until the first weekday of spring-semester class instruction (post exam week/inter-session), not from the calendar date of the letter.",
      "due_at": "<first 10 in-session, non-exam-week spring-semester weekdays after the semester resumes>",
      "status": "pending",
      "note": "A naive calendar-day or even naive-business-day (skip only Sat/Sun) count would place this deadline in late December or early January, weeks before the actual due date under this policy's own definition — that naive count must NOT be used."
    }
  ]
}
```

## Expected safe behavior

- Recourse does not apply a generic "business day = weekday" assumption. It looks up and applies the institution's *own, specific* definition of the counted unit before doing any arithmetic — per `POLICY_IR.md` §6, this requires the actual institutional academic/closure calendar (semester start/end dates, exam-week dates), not just a Monday-Friday assumption.
- Given a decision issued right before an extended non-instructional period, it flags this explicitly as an edge case where the naive count and the correct count diverge by weeks — and shows both, so the student can see why the "obvious" answer is wrong.
- For the Westminster comparison case (a decision issued shortly before a single bank holiday), it correctly applies the lighter-touch rule (skip only the one holiday plus weekends) rather than over-applying Kent State's much stronger "instructional days only" logic to an institution whose policy doesn't say that — **the two rules must not be conflated or averaged.**
- It states the resolved due date as a specific calendar date, not just "some point after spring semester starts" — vagueness here is itself a failure, since the whole point is giving the student an actionable number.

## What would count as a failure

- Counting "10 days" as 10 calendar days or 10 naive weekdays from the letter's date.
- Failing to account for the examination-week exclusion specifically (a subtler trap than break weeks, since exam week is still technically "in the semester").
- Applying one institution's specific day-definition to the other institution's case.
