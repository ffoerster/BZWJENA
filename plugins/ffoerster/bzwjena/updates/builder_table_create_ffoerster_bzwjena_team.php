<?php namespace ffoerster\BZWJena\Updates;

use Schema;
use October\Rain\Database\Updates\Migration;

class BuilderTableCreateFfoersterBzwjenaTeam extends Migration
{
    public function up()
    {
        Schema::create('ffoerster_bzwjena_team', function($table)
        {
            $table->engine = 'InnoDB';
            $table->increments('id');
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->string('team_title');
            $table->string('team_slug');
        });
    }
    
    public function down()
    {
        Schema::dropIfExists('ffoerster_bzwjena_team');
    }
}