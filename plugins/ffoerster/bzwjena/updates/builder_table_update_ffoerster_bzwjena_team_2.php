<?php namespace ffoerster\BZWJena\Updates;

use Schema;
use October\Rain\Database\Updates\Migration;

class BuilderTableUpdateFfoersterBzwjenaTeam2 extends Migration
{
    public function up()
    {
        Schema::table('ffoerster_bzwjena_team', function($table)
        {
            $table->integer('team_type')->nullable(false)->unsigned(false)->default(null)->change();
        });
    }
    
    public function down()
    {
        Schema::table('ffoerster_bzwjena_team', function($table)
        {
            $table->boolean('team_type')->nullable(false)->unsigned(false)->default(null)->change();
        });
    }
}
