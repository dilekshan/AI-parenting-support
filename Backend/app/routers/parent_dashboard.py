"""Read-only parent dashboard; reflect existing schema, never create it."""
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import MetaData, Table, inspect, select
from sqlalchemy.orm import Session
from app.core.dependencies import current_user
from app.database.connection import get_db
from app.models.user import User

router = APIRouter(prefix='/api/parent', tags=['Parent dashboard'])


# Keep this read-only dashboard limited to parent accounts.
def parent_user(user: User = Depends(current_user)):
    if user.role != 'parent':
        raise HTTPException(403, 'Parent permission required')
    return user


# Read the first available field from the inspected database row.
def value(row, *names):
    return next((row[name] for name in names if name in row and row[name] is not None), None)


# Calculate full years from a valid birth date.
def age(dob):
    if isinstance(dob, datetime):
        dob = dob.date()
    if not isinstance(dob, date) or dob > date.today():
        return None
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


# Follow verified ownership links before returning parent-specific records.
@router.get('/dashboard')
def dashboard(user: User = Depends(parent_user), db: Session = Depends(get_db)):
    connection = db.connection()
    inspector = inspect(connection)
    names = {name.casefold(): name for name in inspector.get_table_names()}
    metadata = MetaData()
    unavailable = {}
    rows = {}
    primary_keys = {}
    link_keys = {}
    chain = None
    previous = None
    owner_filter = None
    # Walk the ownership chain and stop trusting any section with missing relationships.
    for key, label in [('children', 'Child'), ('issues', 'ParentingIssue'), ('guidance', 'AIGuidance'), ('plans', 'ParentingPlan'), ('activities', 'DailyActivity')]:
        name = names.get(label.casefold())
        if name is None:
            unavailable[key] = f'{label} table is not available.'
            rows[key] = None
            previous = None
            continue
        table = Table(name, metadata, autoload_with=connection)
        parent_table = names.get('user') if key == 'children' else previous.name if previous is not None else None
        links = [fk for fk in inspector.get_foreign_keys(name) if (fk.get('referred_table') or '').casefold() == (parent_table or '').casefold() and len(fk.get('constrained_columns', [])) == 1 and len(fk.get('referred_columns', [])) == 1]
        # Refuse ambiguous or missing ownership links instead of guessing access.
        if len(links) != 1 or (key == 'children' and links[0]['referred_columns'] != ['user_id']):
            unavailable[key] = f'{label} ownership relationship is not available.'
            rows[key] = None
            previous = None
            continue
        fk = links[0]
        primary_keys[key] = next(iter(table.primary_key.columns.keys()), None)
        link_keys[key] = fk["constrained_columns"][0]
        if key == 'children':
            chain = table
            owner_filter = table.c[fk['constrained_columns'][0]] == user.user_id
        else:
            chain = chain.join(table, table.c[fk['constrained_columns'][0]] == previous.c[fk['referred_columns'][0]])
        rows[key] = list(db.execute(select(table).select_from(chain).where(owner_filter)).mappings())
        previous = table

    children = None if rows['children'] is None else [dict(name=value(r, 'name', 'child_name'), age=age(value(r, 'date_of_birth')), grade=value(r, 'grade')) for r in rows['children']]
    guidance = None if rows['guidance'] is None else [dict(title=value(r, 'title'), description=value(r, 'guidance_text', 'guidance', 'description'), created_at=value(r, 'created_at')) for r in rows['guidance']]
    plans = None if rows['plans'] is None else [dict(plan_id=r.get(primary_keys.get('plans')), start_date=value(r, 'start_date'), end_date=value(r, 'end_date')) for r in rows['plans']]
    activities = None if rows['activities'] is None else [dict(plan_id=r.get(link_keys.get('activities')), title=value(r, 'title', 'activity_title', 'activity_name'), description=value(r, 'description', 'activity_description'), date=value(r, 'activity_date', 'scheduled_date', 'date'), duration=value(r, 'duration_minutes', 'duration'), status=value(r, 'status', 'completion_status'), category=value(r, 'category'), time=value(r, 'time_of_day')) for r in rows['activities']]
    progress = None
    # Count this week only when activity dates and statuses can be verified.
    if activities is not None:
        start = date.today() - timedelta(days=date.today().weekday())
        week = []
        for activity in activities:
            day = activity['date']
            if isinstance(day, datetime): day = day.date()
            if not isinstance(day, date):
                unavailable['progress'] = 'Activity dates are unavailable for weekly progress.'
                break
            if start <= day < start + timedelta(days=7): week.append(activity)
        else:
            counts = dict(completed=0, in_progress=0, pending=0, skipped=0)
            for activity in week:
                status = str(activity['status'] or '').lower().replace(' ', '_')
                if status not in counts:
                    unavailable['progress'] = 'Activity completion status is unavailable.'
                    break
                counts[status] += 1
            else:
                progress = dict(total=len(week), **counts)
    else:
        unavailable['progress'] = unavailable.get('activities', 'Activities unavailable.')
    return dict(children=children, progress=progress, plans=plans, activities=activities, guidance=guidance,
                learning=None, unavailable={**unavailable, 'learning': 'Learning content is not connected to a verified data source.'})
