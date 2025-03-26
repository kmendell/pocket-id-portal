import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { OIDCClientService } from "$lib/services/oidc-client-service";
import type { PageServerData } from "$lib/types";
import { UserService } from "$lib/services/user-service";
import { config } from "$lib/stores/portal-config.store";

/**
 * Server load function for fetching client data and handling redirects
 */
export const load: PageServerLoad<PageServerData> = async ({
  fetch,
  cookies,
  url,
  locals,
}) => {
  // First handle redirects for the root path based on authentication status
  if (url.pathname === "/") {
    // If we have auth info in locals from hooks.server.ts, use it
    if (locals.isAuthenticated) {
      // Get landing page preference from cookie or use default
      const landingPageCookie = cookies.get("portal_landing_page");
      const preferredLandingPage = landingPageCookie || "dashboard";

      // Redirect to the preferred landing page
      throw redirect(302, `/${preferredLandingPage}`);
    } else {
      // If not authenticated, redirect to login
      throw redirect(302, "/login");
    }
  }

  try {
    // Get authentication headers
    const headers = await OIDCClientService.getAuthHeaders(cookies);

    // Get user ID if available
    const userId = UserService.getUserIdFromCookies(cookies);

    // Fetch basic client data
    const clientsData = await OIDCClientService.fetchClients(fetch, headers);

    // Fetch user groups if we have a user ID
    let userGroups = [];
    if (userId) {
      try {
        userGroups = await UserService.fetchUserGroups(userId, fetch, headers);
      } catch (error) {
        console.warn("Error fetching user groups:", error);
        // Continue without groups
      }
    }

    // Process clients with group access information
    const processedClients =
      await OIDCClientService.processClientsWithGroupAccess(
        clientsData,
        fetch,
        headers,
        userGroups
      );

    return {
      clients: { data: processedClients },
      userGroups,
      status: "success",
      error: null,
    };
  } catch (error) {
    console.error("Error in server load function:", error);
    return {
      clients: { data: [] },
      userGroups: [],
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};
