"""Read-only admin dashboard statistics from the existing database."""
from fastapi import APIRouter, Depends
from sqlalchemy import MetaData, Table, case, func, inspect, select
from sqlalchemy.orm import Session
from app.core.dependencies import current_admin
from app.database.connection import get_db
from app.models.user import User
from app.schemas.admin import DashboardSummary, RecentRegistration

router = APIRouter(prefix="/api/admin", tags=["Admin"])


# Count existing database records and mark unsupported statistics unavailable.
@router.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary(admin: User = Depends(current_admin), db: Session = Depends(get_db)):
    # Inspect through this request's connection; do not create tables or cache
    # missing-table results across requests.
    connection = db.connection()
    tables = {name.casefold(): name for name in inspect(connection).get_table_names()}
    parents, active = db.execute(select(
        func.count(case((User.role == "parent", 1))),
        func.count(case((User.account_status == "active", 1))),
    )).one()

    unavailable = {}
    children = None
    child_table = tables.get("child")
    if child_table is None:
        unavailable["total_children"] = "Child table does not exist."
    else:
        child = Table(child_table, MetaData(), autoload_with=connection)
        children = db.scalar(select(func.count()).select_from(child))

    if "parentsubscription" not in tables:
        unavailable["subscription_users"] = "ParentSubscription table does not exist."
    else:
        # The existing parent_subscription.py is empty. There is no verified
        # user relationship, status field, or validity-period contract to query.
        # Do not guess column names or treat subscription rows as unique users.
        unavailable["subscription_users"] = (
            "Active subscription fields and validity rules are not defined in the existing backend."
        )

    return DashboardSummary(
        total_children=children,
        total_parents=parents,
        active_users=active,
        subscription_users=None,
        unavailable_statistics=unavailable,
    )


# Return only safe fields from the newest registered accounts.
@router.get("/dashboard/recent-registrations", response_model=list[RecentRegistration])
def recent_registrations(admin: User = Depends(current_admin), db: Session = Depends(get_db)):
    return db.execute(
        select(User.user_id, User.name, User.role, User.created_at)
        .order_by(User.created_at.desc(), User.user_id.desc())
        .limit(4)
    ).mappings().all()
