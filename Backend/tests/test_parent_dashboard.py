import os
import secrets
import unittest
from datetime import date
os.environ.setdefault('JWT_SECRET', secrets.token_urlsafe(48))
os.environ.setdefault('DB_HOST', 'localhost')
os.environ.setdefault('DB_USER', 'test')
os.environ.setdefault('DB_PASSWORD', 'unused')
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.user import User
from app.routers.parent_dashboard import dashboard, parent_user


# Group checks for parent dashboard.
class ParentDashboardTests(unittest.TestCase):
    # Prepare isolated fixtures before each test.
    def setUp(self):
        self.engine = create_engine('sqlite:///:memory:')
        self.addCleanup(self.engine.dispose)
        self.user = User(user_id=1, role='parent', account_status='active')

    # Check that missing tables are unavailable not zero.
    def test_missing_tables_are_unavailable_not_zero(self):
        with Session(self.engine) as db:
            data = dashboard(self.user, db)
            self.assertIsNone(data['children'])
            self.assertIsNone(data['progress'])
            self.assertIsNone(data['guidance'])
            self.assertIn('Child', data['unavailable']['children'])

    # Check that admin denied.
    def test_admin_denied(self):
        with self.assertRaises(HTTPException) as error:
            parent_user(User(role='admin'))
        self.assertEqual(error.exception.status_code, 403)

    # Check that ownership chain and empty parent.
    def test_ownership_chain_and_empty_parent(self):
        with self.engine.begin() as c:
            for sql in [
                'CREATE TABLE User (user_id INTEGER PRIMARY KEY)',
                'CREATE TABLE Child (child_id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES User(user_id), name TEXT, date_of_birth DATE, grade TEXT)',
                'CREATE TABLE ParentingIssue (issue_id INTEGER PRIMARY KEY, child_id INTEGER REFERENCES Child(child_id))',
                'CREATE TABLE AIGuidance (guidance_id INTEGER PRIMARY KEY, issue_id INTEGER REFERENCES ParentingIssue(issue_id), guidance_text TEXT)',
                'CREATE TABLE ParentingPlan (plan_id INTEGER PRIMARY KEY, guidance_id INTEGER REFERENCES AIGuidance(guidance_id), start_date DATE, end_date DATE)',
                'CREATE TABLE DailyActivity (activity_id INTEGER PRIMARY KEY, plan_id INTEGER REFERENCES ParentingPlan(plan_id), title TEXT, activity_date DATE, status TEXT, duration_minutes INTEGER)',
            ]: c.execute(text(sql))
            for i in [1,2]:
                c.execute(text('INSERT INTO User VALUES (:i)'), {'i':i})
                c.execute(text("INSERT INTO Child VALUES (:i,:i,:name,'2020-01-01','1')"), {'i':i,'name':f'Child {i}'})
                c.execute(text('INSERT INTO ParentingIssue VALUES (:i,:i)'),{'i':i})
                c.execute(text('INSERT INTO AIGuidance VALUES (:i,:i,:advice)'),{'i':i,'advice':f'Advice {i}'})
                c.execute(text('INSERT INTO ParentingPlan VALUES (:i,:i,:date,:date)'),{'i':i,'date':date.today()})
                c.execute(text("INSERT INTO DailyActivity VALUES (:i,:i,:title,:date,'completed',15)"),{'i':i,'title':f'Activity {i}','date':date.today()})
        with Session(self.engine) as db:
            data = dashboard(self.user, db)
            self.assertEqual([r['name'] for r in data['children']], ['Child 1'])
            self.assertEqual([r['description'] for r in data['guidance']], ['Advice 1'])
            self.assertEqual([r['title'] for r in data['activities']], ['Activity 1'])
            self.assertEqual(data['progress']['completed'],1)
            empty = dashboard(User(user_id=3),db)
            self.assertEqual(empty['children'],[])
            self.assertEqual(empty['progress']['total'],0)

    # Check that unverified ownership never reads children.
    def test_unverified_ownership_never_reads_children(self):
        with self.engine.begin() as c:
            c.execute(text('CREATE TABLE User (user_id INTEGER PRIMARY KEY)'))
            c.execute(text('CREATE TABLE Child (child_id INTEGER, user_id INTEGER, name TEXT)'))
            c.execute(text("INSERT INTO Child VALUES (1,1,'Private')"))
        with Session(self.engine) as db:
            data=dashboard(self.user,db)
            self.assertIsNone(data['children'])
            self.assertIn('ownership',data['unavailable']['children'])

    # Check that http authentication and role checks.
    def test_http_authentication_and_role_checks(self):
        from fastapi.testclient import TestClient
        from app.main import app
        from app.core.dependencies import current_user
        from app.database.connection import get_db
        from unittest.mock import MagicMock
        app.dependency_overrides[get_db] = lambda: MagicMock()
        try:
            with TestClient(app) as client:
                self.assertEqual(client.get('/api/parent/dashboard').status_code,401)
                app.dependency_overrides[current_user] = lambda: User(role='admin', account_status='active')
                self.assertEqual(client.get('/api/parent/dashboard').status_code,403)
        finally:
            app.dependency_overrides.clear()
