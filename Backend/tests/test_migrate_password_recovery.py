import re
import unittest
from contextlib import redirect_stdout
from io import StringIO
from unittest.mock import patch

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.dialects import mysql
from sqlalchemy.schema import CreateTable

from scripts import migrate_password_recovery as migration


class PasswordRecoveryMigrationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        with self.engine.begin() as connection:
            connection.execute(text(
                "CREATE TABLE user (user_id INTEGER PRIMARY KEY, "
                "email VARCHAR(100) NOT NULL UNIQUE)"
            ))
            connection.execute(text(
                "INSERT INTO user (user_id, email) VALUES (7, 'parent@example.com')"
            ))
        self.addCleanup(self.engine.dispose)

    def test_mysql_ddl_uses_the_inspected_physical_table_case(self):
        for user_table_name in ("user", "User"):
            with self.subTest(user_table_name=user_table_name):
                ddl = str(CreateTable(migration.build_recovery_table(user_table_name)).compile(
                    dialect=mysql.dialect()
                ))
                self.assertRegex(
                    ddl,
                    rf"REFERENCES\s+`?{re.escape(user_table_name)}`?\s+\(user_id\)",
                )
                self.assertTrue(ddl.lstrip().startswith("CREATE TABLE password_recovery_challenges"))

    def test_migration_creates_only_recovery_table_and_preserves_user(self):
        with patch.object(migration, "get_engine", return_value=self.engine):
            with patch.object(self.engine, "dispose"):
                with redirect_stdout(StringIO()):
                    self.assertEqual(migration.main(), 0)
                    self.assertEqual(migration.main(), 0)

        inspector = inspect(self.engine)
        self.assertEqual(set(inspector.get_table_names()), {"user", "password_recovery_challenges"})
        foreign_keys = inspector.get_foreign_keys("password_recovery_challenges")
        self.assertTrue(any(
            fk["constrained_columns"] == ["user_id"]
            and fk["referred_table"] == "user"
            and fk["referred_columns"] == ["user_id"]
            for fk in foreign_keys
        ))
        with self.engine.connect() as connection:
            self.assertEqual(
                connection.execute(text("SELECT user_id, email FROM user")).one(),
                (7, "parent@example.com"),
            )


if __name__ == "__main__":
    unittest.main()