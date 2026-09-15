from django.urls import path

from . import group_views, views

# Fixed, predictable routes. Note what is absent: nothing here accepts a URL,
# a hostname, or an upstream API name. This backend cannot be used as a proxy.
urlpatterns = [
    path("health/", views.health, name="health"),
    path("feed/", views.feed, name="feed"),
    path("me/", views.me, name="me"),
    path("friends/", views.friends, name="friends"),
    path("cravings/", views.cravings, name="cravings"),
    path("restaurants/", views.restaurant_list, name="restaurant-list"),
    # The only route that can reach a paid upstream API.
    path("restaurants/search/", views.restaurant_search, name="restaurant-search"),
    path("restaurants/<str:restaurant_id>/", views.restaurant_detail, name="restaurant-detail"),
    path("locations/search/", views.location_search, name="location-search"),
    path("locations/popular/", views.popular_areas, name="location-popular"),
    path("dishes/", views.dish_list, name="dish-list"),
    path("dishes/<str:dish_id>/", views.dish_detail, name="dish-detail"),
    # --- real group sessions ---
    path("groups/", group_views.create_group, name="group-create"),
    path("groups/<str:code>/", group_views.group_status, name="group-status"),
    path("groups/<str:code>/join/", group_views.join_group, name="group-join"),
    path("groups/<str:code>/start/", group_views.start_group, name="group-start"),
    path("groups/<str:code>/deck/", group_views.group_deck, name="group-deck"),
    path("groups/<str:code>/votes/", group_views.submit_vote, name="group-vote"),
    path("groups/<str:code>/finish/", group_views.finish_participant, name="group-finish"),
    path("groups/<str:code>/results/", group_views.group_results, name="group-results"),
]
