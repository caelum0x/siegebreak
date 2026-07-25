resource "fly_app" "redis" {
  name = "siegebreak-redis"
  org  = var.fly_org
}
# Consider Upstash Redis instead for true serverless pricing if queue
# traffic stays low pre-launch.
