from django.urls import path

from . import views

# Fixed, predictable routes. Note what is absent: nothing here accepts a URL,
# a hostname, or an upstream API name. This backend cannot be used as a proxy.
urlpatterns = [
    path("health/", views.health, name="health"),
    path("feed/", views.feed, name="feed"),
    path("me/", views.me, name="me"),
    path("friends/", views.friends, name="friends"),
    path("cravings/", views.cravings, name="cravings"),
    path("restaurants/", views.restaurant_list, name="restaurant-list"),
    path("restaurants/<str:restaurant_id>/", views.restaurant_detail, name="restaurant-detail"),
    path("dishes/", views.dish_list, name="dish-list"),
    path("dishes/<str:dish_id>/", views.dish_detail, name="dish-detail"),
]
