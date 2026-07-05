import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import CaseList from "./pages/CaseList";
import Login from "./pages/Login";
import Placeholder from "./pages/Placeholder";
import ProtectedRoute from "./components/ProtectedRoute";
import CaseCreate from "./pages/CaseCreate";
import AppShell from "./components/layout/AppShell";

import CasePlaceholder from "./pages/CasePlaceholder";
import EvidencePlaceholder from "./pages/EvidencePlaceholder";

import { ROUTES } from "./constants";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Route */}
        <Route path={ROUTES.LOGIN} element={<Login />} />

        {/* Protected Routes */}
        <Route
          path={ROUTES.CASES}
          element={
            <ProtectedRoute>
              <AppShell>
                <CaseList />
              </AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path={ROUTES.NEW_CASE}
          element={
            <ProtectedRoute>
              <AppShell>
                <CaseCreate />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.CASE_DETAIL}
          element={
            <ProtectedRoute>
              <AppShell>
                <CasePlaceholder />
              </AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path={ROUTES.EVIDENCE}
          element={
            <ProtectedRoute>
              <AppShell>
                <EvidencePlaceholder />
              </AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path={ROUTES.NEW_EVIDENCE}
          element={
            <ProtectedRoute>
              <EvidencePlaceholder />
            </ProtectedRoute>
          }
        />

        <Route
          path={ROUTES.EVIDENCE_DETAIL}
          element={
            <ProtectedRoute>
              <EvidencePlaceholder />
            </ProtectedRoute>
          }
        />

        <Route
          path={ROUTES.WITNESSES}
          element={
            <ProtectedRoute>
              <Placeholder title="Witnesses" />
            </ProtectedRoute>
          }
        />

        <Route
          path={ROUTES.CONTRADICTIONS}
          element={
            <ProtectedRoute>
              <Placeholder title="Contradictions" />
            </ProtectedRoute>
          }
        />

        <Route
          path={ROUTES.TIMELINE}
          element={
            <ProtectedRoute>
              <Placeholder title="Timeline" />
            </ProtectedRoute>
          }
        />

        <Route
          path={ROUTES.KNOWLEDGE_GRAPH}
          element={
            <ProtectedRoute>
              <Placeholder title="Knowledge Graph" />
            </ProtectedRoute>
          }
        />

        <Route
          path={ROUTES.ACTIVITY}
          element={
            <ProtectedRoute>
              <Placeholder title="Activity Log" />
            </ProtectedRoute>
          }
        />

        <Route
          path={ROUTES.REPORT}
          element={
            <ProtectedRoute>
              <Placeholder title="Report" />
            </ProtectedRoute>
          }
        />
        {/* Default Route */}
        <Route path="*" element={<Navigate to={ROUTES.CASES} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
