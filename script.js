const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const WHITE = "#FFFFFF";
const BLUE = "#5050FF";
const GREEN = "#32FF32";
const RED = "#FF3232";
const BLACK = "#000000";

class Rect {
  constructor(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.width = w;
    this.height = h;
  }
  get right() { return this.x + this.width; }
  get bottom() { return this.y + this.height; }
  set bottom(value) { this.y = value - this.height; }
  get left() { return this.x; }
  set left(value) { this.x = value; }

  collideRect(other) {
    return !(this.right < other.x || this.x > other.right ||
             this.bottom < other.y || this.y > other.bottom);
  }

  collidePoint(px, py) {
    return (px >= this.x && px <= this.right && py >= this.y && py <= this.bottom);
  }

  midbottom() {
    return { x: this.x + this.width / 2, y: this.y + this.height };
  }
}

// PLAYER SETUP
const player = new Rect(100, 500, 50, 50);
const player_speed = 5;
let player_vel_y = 0;
const gravity = 0.5;
const jump_power = -12;
let on_ground = false;
let facing_right = true;

const platforms = [
  new Rect(0, 580, 1200, 20),
  new Rect(300, 450, 200, 20),
  new Rect(150, 350, 150, 20),
  new Rect(500, 350, 150, 20),
  new Rect(750, 480, 120, 20),
  new Rect(900, 450, 100, 20),
  new Rect(1050, 400, 150, 20),
  new Rect(1250, 460, 100, 20),
  new Rect(1400, 430, 130, 20),
  new Rect(1600, 390, 150, 20),
  new Rect(1800, 460, 100, 20),
  new Rect(1950, 420, 120, 20),
  new Rect(2100, 380, 150, 20),
  new Rect(2300, 460, 200, 20),
];

const finish_box = new Rect(2500, 520, 100, 60);

let game_over = false;
let game_won = false;

// ENEMY CLASS
class Enemy {
  constructor(x, y, width = 40, height = 40, speed = 2, patrol_range = 100) {
    this.rect = new Rect(x, y - height, width, height);
    this.speed = speed;
    this.patrol_range = patrol_range;
    this.start_x = x;
    this.direction = 1;
    this.alive = true;
    this.chasing = false;
    this.vel_y = 0;
    this.on_ground = false;
  }

  apply_gravity() {
    this.vel_y += gravity;
    this.rect.y += this.vel_y;
    this.on_ground = false;

    for (let plat of platforms) {
      if (this.rect.collideRect(plat) && this.vel_y >= 0) {
        if (this.rect.bottom - this.vel_y <= plat.y) {
          this.rect.bottom = plat.y;
          this.vel_y = 0;
          this.on_ground = true;
        }
      }
    }
  }

  is_about_to_fall() {
    let next_x = this.rect.x + this.direction * this.speed;
    let next_y = this.rect.y + this.rect.height + 1; // 1 px below next step

    for (let plat of platforms) {
      if (plat.collidePoint(next_x + this.rect.width / 2, next_y)) {
        return false; // safe, platform ahead
      }
    }
    return true; // no platform, about to fall
  }

  update(player_rect) {
    if (!this.alive) return;
    this.apply_gravity();

    const dist_x = player_rect.x + player_rect.width / 2 - (this.rect.x + this.rect.width / 2);

    // Chase logic only if on ground
    if (Math.abs(dist_x) < 400 && this.on_ground) {
      this.chasing = true;
    } else {
      this.chasing = false;
    }

    if (this.chasing) {
      if (dist_x > 5) {
        if (!this.is_about_to_fall()) {
          this.rect.x += Math.min(this.speed, dist_x);
          this.direction = 1;
        } else {
          this.direction = -1;
        }
      } else if (dist_x < -5) {
        if (!this.is_about_to_fall()) {
          this.rect.x += Math.max(-this.speed, dist_x);
          this.direction = -1;
        } else {
          this.direction = 1;
        }
      }
    } else if (this.on_ground) {
      if (this.is_about_to_fall()) {
        this.direction *= -1;
      } else {
        this.rect.x += this.speed * this.direction;
        if (this.rect.x > this.start_x + this.patrol_range) this.direction = -1;
        if (this.rect.x < this.start_x) this.direction = 1;
      }
    }
  }

  draw(cam_x) {
    if (this.alive) {
      ctx.fillStyle = RED;
      ctx.fillRect(this.rect.x - cam_x, this.rect.y, this.rect.width, this.rect.height);
    }
  }
}

function spawn_enemies(platform_list) {
  const enemies_list = [];
  for (const plat of platform_list) {
    const x_pos = plat.x + plat.width / 2 - 20;
    const y_pos = plat.y;
    enemies_list.push(new Enemy(x_pos, y_pos));
  }
  return enemies_list;
}

const enemies = spawn_enemies(platforms);

// BULLET CLASS
class Bullet {
  constructor(x, y, direction) {
    this.rect = new Rect(x, y, 40, 15);
    this.speed = 20 * direction;
    this.distance_traveled = 0;
    this.max_distance = 300;
    this.active = true;
  }

  update() {
    if (!this.active) return;
    this.rect.x += this.speed;
    this.distance_traveled += Math.abs(this.speed);
    if (this.distance_traveled >= this.max_distance) this.active = false;
  }

  draw(cam_x) {
    if (this.active) {
      ctx.fillStyle = BLUE;
      ctx.fillRect(this.rect.x - cam_x, this.rect.y, this.rect.width, this.rect.height);
    }
  }
}

const bullets = [];

// INPUT HANDLING
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;

  if (e.code === 'KeyF' && !game_over && !game_won) {
    let bullet_x, bullet_speed_dir;
    if (facing_right) {
      bullet_x = player.x + player.width;
      bullet_speed_dir = 1;
    } else {
      bullet_x = player.x - 40;
      bullet_speed_dir = -1;
    }
    const bullet_y = player.y + player.height / 2 - 7;
    bullets.push(new Bullet(bullet_x, bullet_y, bullet_speed_dir));
  }
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

// PLAYER MOVEMENT
function move_player() {
  if (keys['ArrowLeft']) {
    player.x -= player_speed;
    facing_right = false;
  }
  if (keys['ArrowRight']) {
    player.x += player_speed;
    facing_right = true;
  }
  if (keys['Space'] && on_ground) {
    player_vel_y = jump_power;
  }
}

function apply_gravity_player() {
  player.y += player_vel_y;
  player_vel_y += gravity;
  on_ground = false;

  for (let plat of platforms) {
    if (player.collideRect(plat) && player_vel_y >= 0) {
      if (player.bottom - player_vel_y <= plat.y) {
        player.bottom = plat.y;
        player_vel_y = 0;
        on_ground = true;
      }
    }
  }
}

function handle_bullets() {
  for (let bullet of bullets) {
    bullet.update();
    for (let enemy of enemies) {
      if (enemy.alive && bullet.active && bullet.rect.collideRect(enemy.rect)) {
        enemy.alive = false;
        bullet.active = false;
      }
    }
  }
}

function check_player_enemy_collision() {
  for (let enemy of enemies) {
    if (enemy.alive && player.collideRect(enemy.rect)) {
      game_over = true;
    }
  }
}

function check_finish() {
  if (player.collideRect(finish_box)) {
    game_won = true;
  }
}

function draw_message(text, color) {
  ctx.fillStyle = color;
  ctx.font = "72px Arial";
  ctx.textAlign = "center";
  ctx.fillText(text, WIDTH / 2, HEIGHT / 2);
}

function draw() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  // Camera logic
  let cam_x = player.x - WIDTH / 2;
  if (cam_x < 0) cam_x = 0;

  // Draw platforms
  ctx.fillStyle = GREEN;
  for (let plat of platforms) {
    ctx.fillRect(plat.x - cam_x, plat.y, plat.width, plat.height);
  }

  // Draw finish box
  ctx.fillStyle = RED;
  ctx.fillRect(finish_box.x - cam_x, finish_box.y, finish_box.width, finish_box.height);

  // Draw enemies
  for (let enemy of enemies) {
    enemy.draw(cam_x);
  }

  // Draw bullets
  for (let bullet of bullets) {
    bullet.draw(cam_x);
  }

  // Draw player
  ctx.fillStyle = BLUE;
  ctx.fillRect(player.x - cam_x, player.y, player.width, player.height);
}

// Main loop
function gameLoop() {
  if (!game_over && !game_won) {
    move_player();
    apply_gravity_player();
    for (let enemy of enemies) {
      enemy.update(player);
    }
    handle_bullets();
    check_player_enemy_collision();
    check_finish();
  }

  draw();

  if (game_over) {
    draw_message("YOU LOSE! 💀", RED);
  } else if (game_won) {
    draw_message("YOU WIN! 🎉", BLACK);
  }

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
