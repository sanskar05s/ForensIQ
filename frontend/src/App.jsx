import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import CaseList from "./pages/CaseList";
import Login from "./pages/Login";
import Placeholder from "./pages/Placeholder";
import ProtectedRoute from "./components/ProtectedRoute";
import CaseCreate from "./pages/CaseCreate";

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
              <CaseList />
            </ProtectedRoute>
          }
        />

        <Route
          path={ROUTES.NEW_CASE}
          element={
            <ProtectedRoute>
              <CaseCreate />
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
