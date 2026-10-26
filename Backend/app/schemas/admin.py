from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


class DashboardSummary(BaseModel):
    total_children: int | None = Field(ge=0, description="Null when the Child table is unavailable.")
    total_parents: int = Field(ge=0)
    active_users: int = Field(ge=0)
    subscription_users: int | None = Field(ge=0, description="Null when an active subscription count cannot be verified.")
    unavailable_statistics: dict[str, str] = Field(default_factory=dict)


class RecentRegistration(BaseModel):
    user_id: int
    name: str
    role: Literal["parent", "admin"]
    created_at: datetime
