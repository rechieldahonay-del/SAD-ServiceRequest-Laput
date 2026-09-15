# Laboratory Asset and Service Management System

A role-based laboratory system for equipment, borrowing, returns, maintenance, and audit tracking. It uses Supabase Authentication, PostgreSQL, Row Level Security, and protected workflow functions.

## Roles

| Role | Permissions |
| --- | --- |
| Administrator | Manage users and equipment; approve/reject requests; manage maintenance; view audit logs |
| Laboratory Staff | View equipment; release approved requests; process returns; update permitted maintenance records |
| Requester / Viewer | View available equipment; submit borrowing and maintenance requests; view own history |

The interface hides restricted sections, while RLS policies and database functions enforce permissions at database level.

## Features

- Role-aware dashboard navigation
- Equipment register and availability status
- Borrowing approval workflow
- Release, return, overdue, and close controls
- Maintenance request tracking
- Audit trail for sensitive operations
- Admin user invites and pending-account approval
- Responsive simple interface

## Borrowing Workflow

```text
Submitted -> Pending -> Approved / Rejected
Approved -> Released -> Returned -> Closed
Released past due date -> Overdue -> Returned -> Closed
```

Required statuses are `Pending`, `Approved`, `Rejected`, `Released`, `Returned`, `Overdue`, and `Closed`.

Business rules are enforced in Supabase:

- Only available equipment may be requested.
- Equipment under maintenance cannot be borrowed.
- Only administrators may approve or reject.
- Rejected requests cannot be released.
- Only approved requests may be released.
- Released equipment becomes borrowed.
- Good returns become available; damaged returns become maintenance.
- Returned requests cannot be processed twice.
- Sensitive actions are written to `audit_logs`.

## Project Structure

```text
index.html                 Entry redirect to the dashboard
dashboard.html             Role-aware laboratory dashboard
login.html                 Supabase login and registration
supabase_schema.sql        Tables, RLS policies, triggers, and workflow RPCs

css/style.css              Shared and login styles
css/dashboard.css          Dashboard styles

js/supabase.js             Supabase client setup
js/auth.js                 Login and registration logic
js/dashboard.js            Dashboard navigation and workflow logic

actor-diagram.svg          Role and permission diagram
use-case-diagram.svg       Laboratory workflow use cases
erd-diagram.svg            Laboratory database relationships
SAD-analysis.md            Short system analysis
README.md                  Project documentation
```

## Database Tables

- `profiles`: user name, role, and account status (`Pending`, `Approved`, or `Rejected`)
- `user_invites`: administrator-created email and role invitations
- `equipment`: laboratory asset register and status
- `borrowing_requests`: borrowing workflow and transaction state
- `maintenance_requests`: equipment issues and maintenance state
- `audit_logs`: action, module, record, description, user, and timestamp
- `service_requests`: legacy ICT request table retained for compatibility

## Setup

1. Open the project folder in VS Code.
2. Run `supabase_schema.sql` completely in the Supabase SQL Editor.
3. Confirm Supabase Authentication email login is enabled.
4. Start the project with Live Server.
5. Open `login.html`.
6. Register or log in.

Administrators can add a user invite from **Users**. The invited person must
register using the invited email. The new account appears as `Pending`; an
administrator must select **Accept** before that user can open the dashboard.
Rejected accounts remain blocked.

The Supabase project URL must be the base URL, without `/rest/v1/`:

```javascript
const SUPABASE_URL = "https://your-project-id.supabase.co";
```

## Assign Roles

New users are created as `requester`. Promote a user in the Supabase SQL Editor:

```sql
update public.profiles
set role = 'admin', account_status = 'Approved'
where id = (
    select id from auth.users where email = 'admin@example.com'
);
```

For laboratory staff:

```sql
update public.profiles
set role = 'staff', account_status = 'Approved'
where id = (
    select id from auth.users where email = 'staff@example.com'
);
```

Sign out and sign in again after changing a role.

## Functional Tests

| Test | Expected result |
| --- | --- |
| Viewer opens admin section | Section is hidden or access is denied |
| Staff submits request | Request is saved as Pending |
| Administrator approves | Status becomes Approved and audit entry is created |
| Administrator rejects | Status becomes Rejected |
| Release rejected request | Operation is blocked |
| Release approved request | Status becomes Released and equipment becomes Borrowed |
| Return released equipment | Equipment becomes Available or Maintenance if damaged |
| View audit logs | Approval and transaction actions are visible to administrators |
| Staff attempts restricted delete | Operation is blocked |
| Logout and open dashboard | User is redirected to login |

## Documentation

- [Actor diagram](actor-diagram.svg)
- [Use-case diagram](use-case-diagram.svg)
- [ERD](erd-diagram.svg)
- [SAD analysis](SAD-analysis.md)
- [Supabase schema](supabase_schema.sql)
