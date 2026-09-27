# Order state machine

| From              | To                  | Who       | Side effects                                   |
|-------------------|---------------------|-----------|------------------------------------------------|
| draft             | paid                | system    | Stripe webhook; notify engineer; start deadline clock only on accept |
| paid              | accepted            | engineer  | due_at = now + service.turnaround_days; notify client |
| paid              | declined            | engineer  | full refund; notify client                     |
| accepted          | in_progress         | engineer  | notify client                                  |
| in_progress       | delivered           | engineer  | requires >= 1 delivery version; notify client  |
| delivered         | revision_requested  | client    | requires notes; revision_count < included; notify engineer |
| revision_requested| in_progress         | engineer  | —                                              |
| delivered         | approved            | client    | confirm dialog; unlock WAV downloads; schedule payout |
| delivered         | approved            | system    | auto-approve N days after delivery with no response |
| paid/accepted/in_progress | refund_eligible | system | now > due_at + 10 days; offer client refund   |
| refund_eligible   | refunded            | client    | Stripe refund; cancels transfer                |
| approved          | completed           | system    | transfer to engineer succeeded                 |

Progress bar shown to client maps states to steps:
Submitted → Accepted → In progress → Awaiting your approval → (Revision n) → Approved.
Any transition not in this table must throw.
